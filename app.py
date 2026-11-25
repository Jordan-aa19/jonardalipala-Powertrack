import os
import re
import math

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from flask import Flask, jsonify, request, render_template
from google.cloud import firestore
from firebase_config import get_db

app = Flask(__name__)

COLS = ("consumers", "meter_readings", "bills")


# =====================================================
# CUSTOM EXCEPTIONS
# =====================================================

class Invalid(Exception):
    pass


class Missing(Exception):
    pass


class Conflict(Exception):
    pass


# =====================================================
# VALIDATION HELPERS
# =====================================================

def text(d, k):
    v = d.get(k)

    if not isinstance(v, str) or not v.strip():
        raise Invalid(f"{k} is required")

    return v.strip()


def number(d, k):
    try:
        v = float(d[k])

        if not math.isfinite(v) or v < 0 or v > 1e9:
            raise ValueError()

        return v

    except (ValueError, TypeError, KeyError):
        raise Invalid(f"{k} must be a valid nonnegative number")


def day(d, k):
    try:
        return date.fromisoformat(text(d, k)).isoformat()

    except ValueError:
        raise Invalid(f"{k} must be a valid date")


def choice(d, k, options):
    v = text(d, k)

    if v not in options:
        raise Invalid(f"Invalid {k}")

    return v


def money(v):
    return float(
        v.quantize(
            Decimal(".01"),
            rounding=ROUND_HALF_UP
        )
    )


def dec(v):
    return Decimal(str(v))


# =====================================================
# FIRESTORE RECORD CONVERSION
# =====================================================

def record(s):

    d = s.to_dict()
    d["id"] = s.id

    if "created_at" in d and hasattr(
        d["created_at"], "isoformat"
    ):
        d["created_at"] = d["created_at"].isoformat()

    if "updated_at" in d and hasattr(
        d["updated_at"], "isoformat"
    ):
        d["updated_at"] = d["updated_at"].isoformat()

    if (
        "payment_status" in d
        and d["payment_status"] != "Paid"
    ):
        d["payment_status"] = (
            "Overdue"
            if d["due_date"] < date.today().isoformat()
            else "Unpaid"
        )

    return d


# =====================================================
# WEBSITE ROUTE
# =====================================================

@app.get("/")
def home():
    return render_template("index.html")


# =====================================================
# FIRESTORE CONNECTION TEST
# =====================================================

@app.get("/api/health")
def health():

    list(
        get_db()
        .collection("consumers")
        .limit(1)
        .stream()
    )

    return jsonify(ok=True)


# =====================================================
# ERROR HANDLERS
# =====================================================

@app.errorhandler(Invalid)
def invalid(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(Missing)
def missing(e):
    return jsonify(error=str(e)), 404


@app.errorhandler(Conflict)
def conflict(e):
    return jsonify(error=str(e)), 409


@app.errorhandler(Exception)
def error(e):

    from werkzeug.exceptions import HTTPException

    if isinstance(e, HTTPException):
        return jsonify(error=e.description), e.code

    app.logger.exception("Database operation failed")

    return jsonify(
        error=(
            "Database operation failed. "
            "Check terminal and Firestore configuration."
        )
    ), 500


# =====================================================
# FIRESTORE CRUD OPERATIONS
# =====================================================

def mutate(col, ident, data, method):

    db = get_db()

    ref = (
        db.collection(col).document(ident)
        if ident
        else db.collection(col).document()
    )

    @firestore.transactional
    def work(tx):

        # Transaction coordination
        lock = db.collection("_system").document("write_lock")
        lock.get(transaction=tx)

        old = ref.get(transaction=tx)

        if method != "POST" and not old.exists:
            raise Missing("Record not found")

        rows = {
            c: [
                record(s)
                for s in db.collection(c).stream(
                    transaction=tx
                )
            ]
            for c in COLS
        }

        def linked(c, k, v):
            return [
                r for r in rows[c]
                if r.get(k) == v
            ]

        def lookup(c, i):

            r = next(
                (
                    r for r in rows[c]
                    if r["id"] == i
                ),
                None
            )

            if not r:
                raise Invalid(f"Invalid {c} reference")

            return r

        # =============================================
        # DELETE RECORD
        # =============================================

        if method == "DELETE":

            if col == "consumers" and (
                linked(
                    "meter_readings",
                    "consumer_id",
                    ref.id
                )
                or linked(
                    "bills",
                    "consumer_id",
                    ref.id
                )
            ):
                raise Conflict(
                    "Delete linked readings and bills first"
                )

            if col == "meter_readings" and linked(
                "bills",
                "reading_id",
                ref.id
            ):
                raise Conflict(
                    "Delete linked bill first"
                )

            tx.delete(ref)

        else:

            # =========================================
            # CONSUMER MANAGEMENT
            # =========================================

            if col == "consumers":

                d = {
                    k: text(data, k)
                    for k in [
                        "full_name",
                        "account_number",
                        "meter_number",
                        "address",
                        "contact_number",
                        "email"
                    ]
                }

                if not re.fullmatch(
                    r"[^\s@]+@[^\s@]+\.[^\s@]+",
                    d["email"]
                ):
                    raise Invalid("Invalid email")

                if not re.fullmatch(
                    r"[+\d][\d -]{6,19}",
                    d["contact_number"]
                ):
                    raise Invalid("Invalid phone number")

                d["consumer_type"] = choice(
                    data,
                    "consumer_type",
                    [
                        "Residential",
                        "Commercial",
                        "Industrial"
                    ]
                )

                d["status"] = choice(
                    data,
                    "status",
                    ["Active", "Inactive"]
                )

                for k in [
                    "account_number",
                    "meter_number"
                ]:

                    if any(
                        r["id"] != ref.id
                        and r[k].casefold() == d[k].casefold()
                        for r in rows[col]
                    ):
                        raise Conflict(f"Duplicate {k}")

            # =========================================
            # METER READING MANAGEMENT
            # =========================================

            elif col == "meter_readings":

                cid = text(data, "consumer_id")

                lookup("consumers", cid)

                if linked(
                    "bills",
                    "reading_id",
                    ref.id
                ):
                    raise Conflict(
                        "Delete linked bill before editing reading"
                    )

                p = number(data, "previous_reading")
                c = number(data, "current_reading")
                dt = day(data, "reading_date")

                if c < p:
                    raise Invalid(
                        "Current reading cannot be lower "
                        "than previous reading"
                    )

                d = dict(
                    consumer_id=cid,
                    previous_reading=p,
                    current_reading=c,
                    consumption_kwh=float(
                        dec(c) - dec(p)
                    ),
                    reading_date=dt,
                    billing_month=dt[:7],
                    rate_per_kwh=number(
                        data,
                        "rate_per_kwh"
                    )
                )

                if any(
                    r["id"] != ref.id
                    and r["consumer_id"] == cid
                    and r["billing_month"] == dt[:7]
                    for r in rows[col]
                ):
                    raise Conflict(
                        "Monthly reading already exists"
                    )

            # =========================================
            # ELECTRICITY BILL MANAGEMENT
            # =========================================

            else:

                rid = text(data, "reading_id")

                r = lookup(
                    "meter_readings",
                    rid
                )

                fee = number(
                    data,
                    "additional_charge"
                )

                due = day(
                    data,
                    "due_date"
                )

                if due < r["reading_date"]:
                    raise Invalid(
                        "Due date precedes reading date"
                    )

                if any(
                    b["id"] != ref.id
                    and (
                        b["reading_id"] == rid
                        or (
                            b["consumer_id"]
                            == r["consumer_id"]
                            and b["billing_month"]
                            == r["billing_month"]
                        )
                    )
                    for b in rows[col]
                ):
                    raise Conflict(
                        "Monthly bill already exists"
                    )

                status = choice(
                    data,
                    "payment_status",
                    ["Paid", "Unpaid", "Overdue"]
                )

                paid = (
                    day(data, "payment_date")
                    if status == "Paid"
                    else None
                )

                if paid and (
                    paid < r["reading_date"]
                    or paid > date.today().isoformat()
                ):
                    raise Invalid(
                        "Invalid payment date"
                    )

                d = {
                    k: r[k]
                    for k in [
                        "consumer_id",
                        "billing_month",
                        "consumption_kwh",
                        "rate_per_kwh"
                    ]
                }

                d.update(
                    reading_id=rid,

                    additional_charge=fee,

                    total_amount=money(
                        dec(r["consumption_kwh"])
                        * dec(r["rate_per_kwh"])
                        + dec(fee)
                    ),

                    due_date=due,

                    payment_status=(
                        "Paid" if paid else "Unpaid"
                    ),

                    payment_date=paid
                )

            # =========================================
            # SAVE TO FIRESTORE
            # =========================================

            d["updated_at"] = firestore.SERVER_TIMESTAMP

            if method == "POST":

                d["created_at"] = firestore.SERVER_TIMESTAMP

                tx.create(ref, d)

            else:

                tx.update(ref, d)

        tx.set(
            lock,
            {
                "updated_at": firestore.SERVER_TIMESTAMP
            }
        )

    work(db.transaction())

    return (
        {
            "id": ref.id,
            "deleted": True
        }
        if method == "DELETE"
        else record(ref.get())
    )


# =====================================================
# REST API ROUTES
# =====================================================

@app.route(
    "/api/<col>",
    methods=["GET", "POST"]
)
@app.route(
    "/api/<col>/<ident>",
    methods=["GET", "PUT", "DELETE"]
)
def api(col, ident=None):

    if col not in COLS:
        raise Missing("Unknown collection")

    # =============================================
    # READ RECORDS
    # =============================================

    if request.method == "GET":

        c = get_db().collection(col)

        # View single record
        if ident:

            s = c.document(ident).get()

            if not s.exists:
                raise Missing("Record not found")

            return jsonify(record(s))

        # Search and filter
        q = request.args.get(
            "q", ""
        ).casefold()

        field = request.args.get(
            "field", ""
        )

        value = request.args.get(
            "value", ""
        )

        return jsonify([
            r
            for r in map(record, c.stream())
            if (
                not q
                or q in str(r).casefold()
            )
            and (
                not field
                or str(r.get(field, "")) == value
            )
        ])

    # =============================================
    # CREATE, UPDATE AND DELETE
    # =============================================

    d = (
        request.get_json()
        if request.method != "DELETE"
        else {}
    )

    if not isinstance(d, dict):
        raise Invalid("Expected JSON object")

    return jsonify(
        mutate(
            col,
            ident,
            d,
            request.method
        )
    ), 201 if request.method == "POST" else 200


# =====================================================
# POWERTRACK - CRIMSON CIRCUIT
# FLASK SERVER CONFIGURATION
# =====================================================

if __name__ == "__main__":

    port = int(os.getenv("PORT", "5009"))

    print("=" * 60)
    print("POWERTRACK - CRIMSON CIRCUIT")
    print("Electricity Consumption and Billing System")
    print(f"Website: http://127.0.0.1:{port}/")
    print(f"Firestore: http://127.0.0.1:{port}/api/health")
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=port,
        debug=False
    )