from app import mutate
from firebase_config import get_db
from datetime import date, timedelta
from google.cloud.firestore_v1.base_query import FieldFilter
import traceback


# =====================================================
# POWERTRACK - AUTOMATIC SAMPLE DATA
# CRIMSON CIRCUIT EDITION
# =====================================================

CONSUMERS = [
    ("Juan Dela Cruz", "Passi City", "Residential", 1000, 1150),
    ("Maria Santos", "San Enrique", "Residential", 1200, 1400),
    ("Pedro Reyes", "Dingle", "Residential", 1500, 1750),
    ("Angela Garcia", "Dueñas", "Residential", 800, 925),
    ("Michael Flores", "Barotac Nuevo", "Residential", 950, 1120),
    ("Daniel Ramos", "Pototan", "Residential", 1400, 1680),
    ("Sophia Mendoza", "Dumangas", "Residential", 1100, 1290),
    ("Mark Villanueva", "Calinog", "Residential", 1600, 1820),
    ("Christine Aquino", "Lambunao", "Residential", 1300, 1480),
    ("Sunrise Grocery", "Passi City", "Commercial", 2500, 3100),
    ("Golden Bakery", "San Enrique", "Commercial", 3200, 3950),
    ("City Hardware", "Pototan", "Commercial", 4100, 4950),
    ("PowerTech Electronics", "Iloilo City", "Commercial", 3500, 4250),
    ("Metro Manufacturing", "Iloilo City", "Industrial", 8000, 9800),
    ("Prime Industrial Services", "Passi City", "Industrial", 10000, 12500),
]


# =====================================================
# ELECTRICITY RATES
# =====================================================

RATES = {
    "Residential": {
        "rate": 11.50,
        "charge": 50.00
    },
    "Commercial": {
        "rate": 12.75,
        "charge": 150.00
    },
    "Industrial": {
        "rate": 13.50,
        "charge": 500.00
    }
}


# =====================================================
# FIND EXISTING DOCUMENT
# =====================================================

def find_document(db, collection, field, value):

    documents = list(
        db.collection(collection)
        .where(filter=FieldFilter(field, "==", value))
        .limit(1)
        .stream()
    )

    return documents[0] if documents else None


# =====================================================
# MAIN SAMPLE DATA FUNCTION
# =====================================================

def seed_data():

    print("=" * 60)
    print("POWERTRACK ELECTRICITY AND BILLING SYSTEM")
    print("Crimson Circuit Edition")
    print("Automatic Sample Data Generator")
    print("=" * 60)

    # Check Firestore connection

    try:

        db = get_db()

        list(
            db.collection("consumers")
            .limit(1)
            .stream()
        )

        print("[SUCCESS] Connected to Firebase Firestore.")

    except Exception as error:

        print("[ERROR] Cannot connect to Firestore.")
        print(error)

        traceback.print_exc()

        return

    today = date.today()
    billing_month = today.isoformat()[:7]

    created_consumers = 0
    created_readings = 0
    created_bills = 0

    skipped_consumers = 0
    skipped_readings = 0
    skipped_bills = 0

    failed = 0

    for i, item in enumerate(CONSUMERS, 1):

        name, address, consumer_type, previous, current = item

        account = f"DEMO-{i:03}"
        meter_number = f"MTR-DEMO-{i:03}"

        print()
        print("-" * 60)
        print(f"Processing {i}/{len(CONSUMERS)}: {name}")
        print("-" * 60)

        try:

            # =============================================
            # 1. CREATE CONSUMER
            # =============================================

            existing_consumer = find_document(
                db,
                "consumers",
                "account_number",
                account
            )

            if existing_consumer:

                consumer_id = existing_consumer.id

                skipped_consumers += 1

                print("[SKIPPED] Consumer already exists.")

            else:

                consumer_data = {
                    "full_name": name,
                    "account_number": account,
                    "meter_number": meter_number,
                    "address": f"{address}, Iloilo",
                    "contact_number": f"0917000{i:04}",
                    "email": f"demo{i}@example.com",
                    "consumer_type": consumer_type,
                    "status": "Active"
                }

                consumer = mutate(
                    "consumers",
                    None,
                    consumer_data,
                    "POST"
                )

                consumer_id = consumer["id"]

                created_consumers += 1

                print(f"[CREATED] Consumer: {name}")
                print(f"[ID] {consumer_id}")

            # =============================================
            # 2. GET ELECTRICITY RATE
            # =============================================

            rate = RATES[consumer_type]["rate"]

            additional_charge = RATES[
                consumer_type
            ]["charge"]

            # =============================================
            # 3. CHECK EXISTING MONTHLY METER READING
            # =============================================

            readings = list(
                db.collection("meter_readings")
                .where(
                    filter=FieldFilter(
                        "consumer_id",
                        "==",
                        consumer_id
                    )
                )
                .stream()
            )

            existing_reading = next(
                (
                    document
                    for document in readings
                    if document.to_dict().get(
                        "billing_month"
                    ) == billing_month
                ),
                None
            )

            # =============================================
            # 4. CREATE METER READING
            # =============================================

            if existing_reading:

                reading_id = existing_reading.id

                skipped_readings += 1

                print("[SKIPPED] Monthly reading already exists.")

            else:

                reading_data = {
                    "consumer_id": consumer_id,
                    "previous_reading": previous,
                    "current_reading": current,
                    "reading_date": today.isoformat(),
                    "rate_per_kwh": rate
                }

                reading = mutate(
                    "meter_readings",
                    None,
                    reading_data,
                    "POST"
                )

                reading_id = reading["id"]

                created_readings += 1

                print("[CREATED] Meter reading.")
                print(f"[USAGE] {current - previous} kWh")

            # =============================================
            # 5. CHECK EXISTING ELECTRICITY BILL
            # =============================================

            existing_bill = find_document(
                db,
                "bills",
                "reading_id",
                reading_id
            )

            if existing_bill:

                skipped_bills += 1

                print("[SKIPPED] Electricity bill already exists.")

                continue

            # =============================================
            # 6. PAYMENT STATUS
            # =============================================

            if i % 3 == 0:

                payment_status = "Paid"
                payment_date = today.isoformat()

            else:

                payment_status = "Unpaid"
                payment_date = ""

            due_date = today + timedelta(days=15)

            # =============================================
            # 7. CREATE ELECTRICITY BILL
            # =============================================

            bill_data = {
                "reading_id": reading_id,
                "additional_charge": additional_charge,
                "due_date": due_date.isoformat(),
                "payment_status": payment_status,
                "payment_date": payment_date
            }

            bill = mutate(
                "bills",
                None,
                bill_data,
                "POST"
            )

            created_bills += 1

            # Read the actual saved bill from Firestore

            saved_bill = (
                db.collection("bills")
                .document(bill["id"])
                .get()
                .to_dict()
            ) or {}

            total_amount = saved_bill.get(
                "total_amount",
                0
            )

            print("[CREATED] Electricity bill.")
            print(f"[AMOUNT] PHP {float(total_amount):,.2f}")
            print(f"[STATUS] {payment_status}")

        except Exception as error:

            failed += 1

            print(f"[ERROR] Failed to process {name}")
            print(f"[REASON] {error}")

            traceback.print_exc()

    # =====================================================
    # INSERTION SUMMARY
    # =====================================================

    print()
    print("=" * 60)
    print("POWERTRACK DATA INSERTION SUMMARY")
    print("=" * 60)

    print(f"New consumers       : {created_consumers}")
    print(f"New meter readings  : {created_readings}")
    print(f"New electricity bills: {created_bills}")

    print("-" * 60)

    print(f"Existing consumers  : {skipped_consumers}")
    print(f"Existing readings   : {skipped_readings}")
    print(f"Existing bills      : {skipped_bills}")

    print("-" * 60)

    total_created = (
        created_consumers
        + created_readings
        + created_bills
    )

    print(f"Total new documents : {total_created}")
    print(f"Failed consumers    : {failed}")

    print("=" * 60)

    if failed == 0:

        print("[SUCCESS] Sample data insertion completed.")

    else:

        print("[WARNING] Some records failed.")
        print("Review the error messages above.")

    print("Check your Firebase Firestore database.")
    print("=" * 60)


# =====================================================
# RUN SCRIPT
# =====================================================

if __name__ == "__main__":

    seed_data()