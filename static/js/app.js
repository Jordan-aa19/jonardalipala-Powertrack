"use strict";

/* =====================================================
   POWERTRACK - CRIMSON CIRCUIT
   COMPLETE FRONTEND JAVASCRIPT
===================================================== */

const $ = id => document.getElementById(id);

const esc = value => String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]
);


/* =====================================================
   COLLECTION CONFIGURATION
===================================================== */

const titles = {
    consumers: "Consumers",
    meter_readings: "Meter Readings",
    bills: "Electricity Bills"
};

const schema = {

    consumers: [
        ["full_name", "text"],
        ["account_number", "text"],
        ["meter_number", "text"],
        ["address", "text"],
        ["contact_number", "tel"],
        ["email", "email"],
        ["consumer_type", [
            "Residential",
            "Commercial",
            "Industrial"
        ]],
        ["status", [
            "Active",
            "Inactive"
        ]]
    ],

    meter_readings: [
        ["consumer_id", "consumers"],
        ["previous_reading", "number"],
        ["current_reading", "number"],
        ["reading_date", "date"],
        ["rate_per_kwh", "number"]
    ],

    bills: [
        ["reading_id", "meter_readings"],
        ["additional_charge", "number"],
        ["due_date", "date"],
        ["payment_status", [
            "Unpaid",
            "Paid"
        ]],
        ["payment_date", "date"]
    ]
};


/* =====================================================
   GLOBAL VARIABLES
===================================================== */

let data = {
    consumers: [],
    meter_readings: [],
    bills: []
};

let page = "dashboard";

let cards = false;

let editing = null;

let editingCollection = null;

let deleteId = null;

let deleteCollection = null;

let detailPage = "";

let bars = [];

let saving = false;

let deleting = false;

let noticeTimer = null;


/* =====================================================
   GENERAL HELPERS
===================================================== */

function label(key) {

    return key
        .replaceAll("_", " ")
        .replace(/^./, char => char.toUpperCase());

}


function peso(value) {

    return Number(value || 0).toLocaleString(
        "en-PH",
        {
            style: "currency",
            currency: "PHP"
        }
    );

}


function today() {

    const now = new Date();

    const offset = now.getTimezoneOffset();

    return new Date(
        now.getTime() - offset * 60000
    ).toISOString().slice(0, 10);

}


/* =====================================================
   API CONNECTION
===================================================== */

async function api(path, method = "GET", body = null) {

    const options = {
        method: method,
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    };

    if (body !== null) {

        options.body = JSON.stringify(body);

    }

    let response;

    try {

        response = await fetch(
            "/api/" + path,
            options
        );

    } catch (error) {

        throw new Error(
            "Cannot connect to Flask server. Make sure app.py is running."
        );

    }

    const text = await response.text();

    let result = {};

    try {

        result = text ? JSON.parse(text) : {};

    } catch (error) {

        throw new Error(
            `Server returned an invalid response (HTTP ${response.status}). Check the PyCharm terminal.`
        );

    }

    if (!response.ok) {

        throw new Error(
            result.error ||
            result.message ||
            `Request failed (HTTP ${response.status})`
        );

    }

    return result;

}


/* =====================================================
   NOTIFICATIONS
===================================================== */

function notify(message, type = "success") {

    const notice = $("notice");

    notice.textContent = message;

    notice.className = "notice " + type;

    notice.style.color =
        type === "error"
            ? "#f04b60"
            : "#38c98b";

    clearTimeout(noticeTimer);

    noticeTimer = setTimeout(() => {

        notice.textContent = "";

    }, 6000);

}


/* =====================================================
   CONSUMER AND READING REFERENCES
===================================================== */

function consumer(id) {

    const record = data.consumers.find(
        item => item.id === id
    );

    return record?.full_name || id || "Unknown consumer";

}


function paymentStatus(record) {

    if (record.payment_status === "Paid") {

        return "Paid";

    }

    if (
        record.due_date &&
        record.due_date < today()
    ) {

        return "Overdue";

    }

    return record.payment_status || "Unpaid";

}


function display(key, value, record = {}) {

    if (key === "consumer_id") {

        return consumer(value);

    }

    if (key === "reading_id") {

        const reading = data.meter_readings.find(
            item => item.id === value
        );

        return reading
            ? `${consumer(reading.consumer_id)} / ${reading.billing_month}`
            : value;

    }

    if (key === "payment_status") {

        return paymentStatus(record);

    }

    if ([
        "total_amount",
        "additional_charge",
        "rate_per_kwh"
    ].includes(key)) {

        return peso(value);

    }

    if (key === "consumption_kwh") {

        return `${Number(value || 0).toFixed(2)} kWh`;

    }

    return value ?? "—";

}


/* =====================================================
   LOAD ACTUAL FIRESTORE RECORDS
===================================================== */

async function refresh() {

    try {

        const keys = Object.keys(data);

        const results = await Promise.all(
            keys.map(key => api(key))
        );

        keys.forEach((key, index) => {

            if (!Array.isArray(results[index])) {

                throw new Error(
                    `Invalid response for ${key}.`
                );

            }

            data[key] = results[index];

        });

        $("connection").textContent =
            "● Firestore connected";

        $("connection").style.color =
            "#38c98b";

        render();

        return true;

    } catch (error) {

        $("connection").textContent =
            "● Connection error";

        $("connection").style.color =
            "#f04b60";

        notify(error.message, "error");

        console.error(error);

        return false;

    }

}


/* =====================================================
   ANIMATED DASHBOARD STATISTICS
===================================================== */

function animate(element, target, format) {

    if (!element) return;

    const start = performance.now();

    function tick(time) {

        const progress = Math.min(
            1,
            (time - start) / 500
        );

        element.textContent = format(
            target * progress
        );

        if (progress < 1) {

            requestAnimationFrame(tick);

        }

    }

    requestAnimationFrame(tick);

}


function dashboard() {

    const totalConsumption =
        data.meter_readings.reduce(
            (sum, record) =>
                sum + Number(record.consumption_kwh || 0),
            0
        );

    const collectedRevenue =
        data.bills
            .filter(
                bill => bill.payment_status === "Paid"
            )
            .reduce(
                (sum, bill) =>
                    sum + Number(bill.total_amount || 0),
                0
            );

    const pendingBills =
        data.bills.filter(
            bill => bill.payment_status !== "Paid"
        ).length;

    const stats = [

        [
            "👥 Total Consumers",
            data.consumers.length,
            number => Math.round(number)
        ],

        [
            "⚡ Consumption (kWh)",
            totalConsumption,
            number => number.toFixed(1)
        ],

        [
            "💰 Collected Revenue",
            collectedRevenue,
            peso
        ],

        [
            "🧾 Pending Bills",
            pendingBills,
            number => Math.round(number)
        ]

    ];

    $("stats").innerHTML = stats.map(
        ([name], index) => `

            <div class="stat">

                <p>${name}</p>

                <strong id="stat${index}">
                    0
                </strong>

            </div>

        `
    ).join("");

    stats.forEach(
        ([name, value, format], index) => {

            animate(
                $("stat" + index),
                value,
                format
            );

        }
    );

    chart();

}


/* =====================================================
   INTERACTIVE CONSUMPTION CHART
===================================================== */

function chart() {

    const canvas = $("chart");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    const width = canvas.clientWidth || 600;

    const height = 230;

    const ratio = window.devicePixelRatio || 1;

    canvas.style.height = height + "px";

    canvas.width = width * ratio;

    canvas.height = height * ratio;

    ctx.scale(ratio, ratio);

    ctx.clearRect(0, 0, width, height);

    const months = {};

    data.meter_readings.forEach(record => {

        const month = record.billing_month;

        if (!month) return;

        months[month] =
            (months[month] || 0) +
            Number(record.consumption_kwh || 0);

    });

    const entries = Object.entries(months)
        .sort()
        .slice(-12);

    const max = Math.max(
        1,
        ...entries.map(item => item[1])
    );

    const step =
        (width - 30) /
        Math.max(1, entries.length);

    bars = [];

    const ink = getComputedStyle(
        document.body
    ).getPropertyValue("--ink").trim() || "#999";

    ctx.font = "11px system-ui";

    ctx.fillStyle = ink;

    if (!entries.length) {

        ctx.fillText(
            "No meter readings yet",
            15,
            30
        );

        return;

    }

    entries.forEach(([month, value], index) => {

        const x = 15 + index * step;

        const barHeight = value / max * 170;

        const gradient = ctx.createLinearGradient(
            0, 0, 0, 190
        );

        gradient.addColorStop(0, "#ff718b");

        gradient.addColorStop(1, "#a51d35");

        ctx.fillStyle = gradient;

        ctx.fillRect(
            x,
            190 - barHeight,
            step * 0.65,
            barHeight
        );

        ctx.fillStyle = ink;

        ctx.fillText(
            month,
            x,
            210,
            step * 0.95
        );

        bars.push({
            x: x,
            w: step * 0.65,
            y: 190 - barHeight,
            h: barHeight,
            m: month,
            v: value
        });

    });

}


$("chart").onclick = event => {

    const rect = $("chart").getBoundingClientRect();

    const x = event.clientX - rect.left;

    const y = event.clientY - rect.top;

    const bar = bars.find(item =>
        x >= item.x &&
        x <= item.x + item.w &&
        y >= item.y &&
        y <= item.y + item.h
    );

    if (bar) {

        $("chartTip").textContent =
            `${bar.m}: ${bar.v.toFixed(2)} kWh`;

    }

};


/* =====================================================
   NAVIGATION
===================================================== */

function navigate(destination) {

    if (
        destination !== "dashboard" &&
        !schema[destination]
    ) {

        return;

    }

    page = destination;

    $("dashboard").hidden =
        page !== "dashboard";

    $("records").hidden =
        page === "dashboard";

    document.querySelectorAll("[data-page]")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );

        });

    $("search").value = "";

    let options = [];

    if (page === "consumers") {

        options = [
            "Active",
            "Inactive"
        ];

    }

    if (page === "bills") {

        options = [
            "Paid",
            "Unpaid",
            "Overdue"
        ];

    }

    $("filter").innerHTML =
        '<option value="">All statuses</option>' +

        options.map(option => `

            <option value="${esc(option)}">
                ${esc(option)}
            </option>

        `).join("");

    $("filter").hidden = !options.length;

    render();

}


/* =====================================================
   STATUS BADGES
===================================================== */

function statusHTML(value) {

    const colors = {
        Active: "#27ae75",
        Inactive: "#89919c",
        Paid: "#27ae75",
        Unpaid: "#e6a23c",
        Overdue: "#f04b60"
    };

    const color = colors[value] || "#89919c";

    return `

        <span style="
            display:inline-block;
            color:${color};
            background:${color}20;
            padding:6px 12px;
            border-radius:20px;
            font-weight:700;
            font-size:12px;
        ">

            ${esc(value)}

        </span>

    `;

}


function cellHTML(key, record) {

    const value = display(
        key,
        record[key],
        record
    );

    if (
        key === "status" ||
        key === "payment_status"
    ) {

        return statusHTML(value);

    }

    return esc(value);

}


/* =====================================================
   CRUD ACTION BUTTONS
===================================================== */

function actionButtons(record) {

    return `

        <div class="actions">

            <button
                type="button"
                class="read"
                data-action="read"
                data-id="${esc(record.id)}">

                View

            </button>

            <button
                type="button"
                class="edit"
                data-action="edit"
                data-id="${esc(record.id)}">

                Edit

            </button>

            <button
                type="button"
                class="delete"
                data-action="delete"
                data-id="${esc(record.id)}">

                Delete

            </button>

        </div>

    `;

}


/* =====================================================
   RENDER TABLE AND CARD VIEWS
===================================================== */

function render() {

    if (page === "dashboard") {

        dashboard();

        return;

    }

    $("heading").textContent = titles[page];

    const query =
        $("search").value.trim().toLowerCase();

    const filter = $("filter").value;

    const rows = data[page].filter(record => {

        const status = page === "bills"
            ? paymentStatus(record)
            : record.status;

        const matchesFilter =
            !filter || status === filter;

        const searchableText =
            Object.entries(record)
                .map(([key, value]) =>
                    display(key, value, record)
                )
                .join(" ")
                .toLowerCase();

        const matchesSearch =
            !query || searchableText.includes(query);

        return matchesFilter && matchesSearch;

    });

    let keys = [];

    if (page === "consumers") {

        keys = [
            "full_name",
            "account_number",
            "meter_number",
            "consumer_type",
            "status"
        ];

    } else if (page === "meter_readings") {

        keys = [
            "consumer_id",
            "billing_month",
            "consumption_kwh",
            "rate_per_kwh"
        ];

    } else {

        keys = [
            "consumer_id",
            "billing_month",
            "total_amount",
            "payment_status"
        ];

    }

    if (!rows.length) {

        $("list").innerHTML = `

            <div class="panel">

                <h3>No matching records</h3>

                <p>Add a new record to begin.</p>

            </div>

        `;

        return;

    }


    /* CARD VIEW */

    if (cards) {

        $("list").innerHTML = `

            <div class="cards">

                ${rows.map(record => `

                    <article class="item">

                        ${keys.map(key => `

                            <p>

                                <b>${label(key)}:</b>

                                ${cellHTML(key, record)}

                            </p>

                        `).join("")}

                        ${actionButtons(record)}

                    </article>

                `).join("")}

            </div>

        `;

        return;

    }


    /* TABLE VIEW */

    $("list").innerHTML = `

        <div class="tablewrap">

            <table>

                <thead>

                    <tr>

                        ${keys.map(key => `

                            <th>${label(key)}</th>

                        `).join("")}

                        <th>Actions</th>

                    </tr>

                </thead>

                <tbody>

                    ${rows.map(record => `

                        <tr>

                            ${keys.map(key => `

                                <td>
                                    ${cellHTML(key, record)}
                                </td>

                            `).join("")}

                            <td>

                                ${actionButtons(record)}

                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        </div>

    `;

}


/* =====================================================
   ADD AND EDIT FORM
===================================================== */

function openForm(record = {}) {

    if (!schema[page]) return;

    editing = record.id || null;

    editingCollection = page;

    $("modalTitle").textContent =
        (editing ? "Edit " : "Add ") +
        titles[page];

    $("formError").textContent = "";

    $("fields").innerHTML =
        schema[page].map(([key, type]) => {

            let value = record[key] ?? "";

            if (!editing) {

                if (key === "reading_date") {

                    value = today();

                }

                if (key === "due_date") {

                    const due = new Date();

                    due.setDate(due.getDate() + 15);

                    const offset = due.getTimezoneOffset();

                    value = new Date(
                        due.getTime() - offset * 60000
                    ).toISOString().slice(0, 10);

                }

                if (key === "rate_per_kwh") {

                    value = 11.50;

                }

                if (key === "additional_charge") {

                    value = 0;

                }

                if (key === "status") {

                    value = "Active";

                }

                if (key === "payment_status") {

                    value = "Unpaid";

                }

            }

            if (
                key === "payment_status" &&
                value === "Overdue"
            ) {

                value = "Unpaid";

            }

            let options = null;

            if (Array.isArray(type)) {

                options = type.map(
                    item => [item, item]
                );

            } else if (data[type]) {

                let records = data[type];

                if (type === "meter_readings") {

                    records = records.filter(reading =>

                        reading.id === record.reading_id ||

                        !data.bills.some(
                            bill =>
                                bill.reading_id === reading.id
                        )

                    );

                }

                options = records.map(item => [

                    item.id,

                    type === "consumers"

                        ? item.full_name

                        : `${consumer(item.consumer_id)} / ${item.billing_month}`

                ]);

            }

            if (options) {

                return `

                    <label>

                        ${label(key)}

                        <select name="${key}" required>

                            <option value="">
                                Select…
                            </option>

                            ${options.map(([id, name]) => `

                                <option
                                    value="${esc(id)}"
                                    ${String(id) === String(value)
                                        ? "selected"
                                        : ""}>

                                    ${esc(name)}

                                </option>

                            `).join("")}

                        </select>

                    </label>

                `;

            }

            return `

                <label>

                    ${label(key)}

                    <input
                        name="${key}"
                        type="${type}"
                        value="${esc(value)}"
                        ${key === "payment_date"
                            ? ""
                            : "required"}
                        ${type === "number"
                            ? 'min="0" step="any"'
                            : ""}>

                </label>

            `;

        }).join("") +

        '<p id="estimate"></p>';

    if (!$("modal").open) {

        $("modal").showModal();

    }

    estimate();

}


/* =====================================================
   AUTOMATIC BILL AND CONSUMPTION CALCULATIONS
===================================================== */

function estimate() {

    const estimateElement = $("estimate");

    if (!estimateElement) return;

    const form = $("form");

    const values = Object.fromEntries(
        new FormData(form)
    );

    if (editingCollection === "meter_readings") {

        const previous = Number(
            values.previous_reading || 0
        );

        const current = Number(
            values.current_reading || 0
        );

        const usage = current - previous;

        if (usage < 0) {

            estimateElement.textContent =
                "Current reading cannot be lower than previous reading.";

            estimateElement.style.color =
                "#f04b60";

        } else {

            estimateElement.textContent =
                `Consumption: ${usage.toFixed(2)} kWh`;

            estimateElement.style.color =
                "#38c98b";

        }

    }

    if (editingCollection === "bills") {

        const reading = data.meter_readings.find(
            item => item.id === values.reading_id
        );

        if (reading) {

            const amount =
                Number(reading.consumption_kwh || 0) *
                Number(reading.rate_per_kwh || 0) +
                Number(values.additional_charge || 0);

            estimateElement.textContent =
                "Estimated bill: " + peso(amount);

            estimateElement.style.color =
                "#38c98b";

        } else {

            estimateElement.textContent = "";

        }

        const paymentDate =
            form.elements.payment_date;

        if (paymentDate) {

            const paid =
                values.payment_status === "Paid";

            paymentDate.required = paid;

            paymentDate.disabled = !paid;

            if (paid && !paymentDate.value) {

                paymentDate.value = today();

            }

            if (!paid) {

                paymentDate.value = "";

            }

        }

    }

}


/* =====================================================
   CLIENT-SIDE VALIDATION
===================================================== */

function validateForm(collection, values) {

    if (collection === "consumers") {

        if (!values.full_name?.trim()) {

            throw new Error(
                "Consumer name is required."
            );

        }

        if (!values.account_number?.trim()) {

            throw new Error(
                "Account number is required."
            );

        }

        if (!values.meter_number?.trim()) {

            throw new Error(
                "Meter number is required."
            );

        }

    }

    if (collection === "meter_readings") {

        const previous = Number(
            values.previous_reading
        );

        const current = Number(
            values.current_reading
        );

        const rate = Number(
            values.rate_per_kwh
        );

        if (!values.consumer_id) {

            throw new Error(
                "Please select a consumer."
            );

        }

        if (
            !Number.isFinite(previous) ||
            !Number.isFinite(current) ||
            previous < 0 ||
            current < 0
        ) {

            throw new Error(
                "Enter valid meter readings."
            );

        }

        if (current < previous) {

            throw new Error(
                "Current reading cannot be lower than previous reading."
            );

        }

        if (!Number.isFinite(rate) || rate < 0) {

            throw new Error(
                "Enter a valid electricity rate."
            );

        }

    }

    if (collection === "bills") {

        if (!values.reading_id) {

            throw new Error(
                "Please select a meter reading."
            );

        }

        if (
            values.payment_status === "Paid" &&
            !values.payment_date
        ) {

            throw new Error(
                "Payment date is required for paid bills."
            );

        }

        if (values.payment_status !== "Paid") {

            values.payment_date = "";

        }

    }

    return values;

}


/* =====================================================
   CREATE AND UPDATE RECORDS
===================================================== */

$("form").oninput = estimate;

$("form").onchange = estimate;


$("form").onsubmit = async event => {

    event.preventDefault();

    if (saving) return;

    $("formError").textContent = "";

    const collection = editingCollection;

    const recordId = editing;

    try {

        const values = validateForm(

            collection,

            Object.fromEntries(
                new FormData($("form"))
            )

        );

        saving = true;

        $("save").disabled = true;

        $("cancel").disabled = true;

        $("save").textContent = "Saving...";

        const path = recordId

            ? collection + "/" +
                encodeURIComponent(recordId)

            : collection;

        const method = recordId
            ? "PUT"
            : "POST";

        await api(
            path,
            method,
            values
        );

        $("modal").close();

        const refreshed = await refresh();

        if (refreshed) {

            notify(
                recordId

                    ? "Record updated successfully!"

                    : "Record added successfully!"
            );

        } else {

            notify(
                "Record saved, but refresh failed. Reload the page.",
                "error"
            );

        }

    } catch (error) {

        $("formError").textContent =
            error.message;

        console.error("Save error:", error);

    } finally {

        saving = false;

        $("save").disabled = false;

        $("cancel").disabled = false;

        $("save").textContent = "Save";

    }

};


/* =====================================================
   SINGLE RECORD VIEW
===================================================== */

function showDetails(record, collection) {

    detailPage = collection;

    $("detailBody").innerHTML = `

        <h2>

            ⚡ PowerTrack — ${esc(titles[collection])}

        </h2>

        ${Object.entries(record).map(
            ([key, value]) => `

                <p>

                    <b>${label(key)}:</b>

                    ${esc(display(key, value, record))}

                </p>

            `
        ).join("")}

    `;

    $("print").hidden =
        collection !== "bills";

    $("detail").showModal();

}


/* =====================================================
   CRUD BUTTON EVENT DELEGATION
===================================================== */

$("list").onclick = async event => {

    const button = event.target.closest(
        "[data-action]"
    );

    if (!button) return;

    event.preventDefault();

    const action = button.dataset.action;

    const recordId = button.dataset.id;

    const collection = page;

    if (!recordId) {

        notify(
            "Record ID is missing.",
            "error"
        );

        return;

    }

    try {

        /* DELETE */

        if (action === "delete") {

            openDeleteDialog(
                collection,
                recordId
            );

            return;

        }

        /* READ SINGLE RECORD */

        const record = await api(

            collection + "/" +
            encodeURIComponent(recordId)

        );

        if (page !== collection) return;

        /* EDIT */

        if (action === "edit") {

            openForm(record);

        }

        /* VIEW */

        if (action === "read") {

            showDetails(
                record,
                collection
            );

        }

    } catch (error) {

        notify(
            error.message,
            "error"
        );

        console.error(error);

    }

};


/* =====================================================
   OPEN DELETE CONFIRMATION
===================================================== */

function openDeleteDialog(collection, recordId) {

    deleteCollection = collection;

    deleteId = recordId;

    $("deleteError").textContent = "";

    $("yes").disabled = false;

    $("no").disabled = false;

    $("yes").textContent = "Delete";

    if (!$("confirm").open) {

        $("confirm").showModal();

    }

}


/* =====================================================
   CANCEL DELETE - FIXED
===================================================== */

$("no").onclick = event => {

    event.preventDefault();

    event.stopPropagation();

    if (deleting) return;

    $("deleteError").textContent = "";

    $("confirm").close();

    deleteId = null;

    deleteCollection = null;

};


/* =====================================================
   CONFIRM DELETE - FIXED
===================================================== */

$("yes").onclick = async event => {

    event.preventDefault();

    event.stopPropagation();

    if (deleting) return;

    $("deleteError").textContent = "";

    if (!deleteId || !deleteCollection) {

        $("deleteError").textContent =
            "No record selected.";

        return;

    }

    const recordId = deleteId;

    const collection = deleteCollection;

    deleting = true;

    $("yes").disabled = true;

    $("no").disabled = true;

    $("yes").textContent = "Deleting...";

    try {

        /* ACTUAL FIRESTORE DELETE REQUEST */

        await api(

            collection + "/" +
            encodeURIComponent(recordId),

            "DELETE"

        );

        $("confirm").close();

        deleteId = null;

        deleteCollection = null;

        /* REFRESH ACTUAL DATABASE RECORDS */

        const refreshed = await refresh();

        if (refreshed) {

            notify(
                "Record deleted successfully!"
            );

        } else {

            notify(
                "Record deleted, but refresh failed. Reload the page.",
                "error"
            );

        }

    } catch (error) {

        /* KEEP THE CONFIRMATION DIALOG OPEN */

        $("deleteError").textContent =
            error.message ||
            "Unable to delete record.";

        console.error(
            "Delete error:",
            error
        );

    } finally {

        deleting = false;

        $("yes").disabled = false;

        $("no").disabled = false;

        $("yes").textContent = "Delete";

    }

};


/* =====================================================
   DELETE DIALOG EVENTS
===================================================== */

$("confirm").addEventListener(
    "cancel",
    event => {

        if (deleting) {

            event.preventDefault();

        }

    }
);


$("confirm").addEventListener(
    "close",
    () => {

        if (!deleting) {

            deleteId = null;

            deleteCollection = null;

            $("deleteError").textContent = "";

        }

    }
);


/* =====================================================
   CANCEL ADD AND EDIT
===================================================== */

$("cancel").onclick = event => {

    event.preventDefault();

    if (saving) return;

    $("modal").close();

    editing = null;

    editingCollection = null;

    $("formError").textContent = "";

};


$("modal").addEventListener(
    "cancel",
    event => {

        if (saving) {

            event.preventDefault();

        }

    }
);


/* =====================================================
   CLOSE SINGLE RECORD DETAILS
===================================================== */

$("closeDetail").onclick = () => {

    $("detail").close();

};


/* =====================================================
   PRINT ELECTRICITY BILL
===================================================== */

$("print").onclick = () => {

    if (detailPage !== "bills") return;

    window.print();

};


/* =====================================================
   ADD NEW RECORD
===================================================== */

$("add").onclick = () => {

    openForm();

};


/* =====================================================
   QUICK METER READING
===================================================== */

$("quick").onclick = () => {

    navigate("meter_readings");

    openForm();

};


/* =====================================================
   SEARCH AND FILTER
===================================================== */

$("search").oninput = render;

$("filter").onchange = render;


/* =====================================================
   CARD AND TABLE VIEW
===================================================== */

$("view").onclick = () => {

    cards = !cards;

    $("view").textContent = cards

        ? "Table View"

        : "Card View";

    render();

};


/* =====================================================
   FLOATING DOCK NAVIGATION
===================================================== */

document.querySelectorAll("[data-page]")
    .forEach(button => {

        button.onclick = () => {

            navigate(
                button.dataset.page
            );

        };

    });


/* =====================================================
   DARK AND LIGHT MODE
===================================================== */

$("theme").onclick = () => {

    document.body.classList.toggle("light");

    const light =
        document.body.classList.contains("light");

    localStorage.setItem(

        "powertrack-theme",

        light ? "light" : "dark"

    );

    $("theme").textContent = light

        ? "☾ Dark Mode"

        : "☀ Light Mode";

    if (page === "dashboard") {

        chart();

    }

};


if (
    localStorage.getItem("powertrack-theme") === "light"
) {

    document.body.classList.add("light");

    $("theme").textContent = "☾ Dark Mode";

} else {

    $("theme").textContent = "☀ Light Mode";

}


/* =====================================================
   RIPPLE BUTTON EFFECT
===================================================== */

document.addEventListener(
    "click",
    event => {

        const button = event.target.closest(
            "button"
        );

        if (!button || button.disabled) return;

        const ripple = document.createElement(
            "span"
        );

        const rect = button.getBoundingClientRect();

        ripple.className = "ripple";

        ripple.style.pointerEvents = "none";

        ripple.style.left =
            (event.clientX - rect.left - 10) + "px";

        ripple.style.top =
            (event.clientY - rect.top - 10) + "px";

        button.appendChild(ripple);

        setTimeout(() => {

            ripple.remove();

        }, 600);

    }
);


/* =====================================================
   RESPONSIVE CHART
===================================================== */

window.addEventListener(
    "resize",
    () => {

        if (page === "dashboard") {

            chart();

        }

    }
);


/* =====================================================
   INITIALIZE POWERTRACK
===================================================== */

navigate("dashboard");

refresh();