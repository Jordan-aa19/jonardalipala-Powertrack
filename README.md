# ⚡ PowerTrack — Crimson Circuit

## Electricity Consumption and Billing Management System

PowerTrack is a web-based electricity consumption and billing management system developed using Python Flask and Firebase Cloud Firestore. It provides a centralized platform for managing consumer information, monitoring electricity consumption, recording meter readings, calculating electricity bills, and tracking payment status.

The system features a modern Crimson Circuit interface designed to provide an interactive, responsive, and user-friendly experience.

## Project Objectives

- Provide centralized management of electricity consumer records.
- Monitor and record monthly electricity consumption.
- Automatically calculate electricity bills based on meter readings.
- Track paid, unpaid, and overdue electricity bills.
- Implement CRUD operations using Firebase Cloud Firestore.
- Maintain accurate and organized records through data validation.

## System Features

- Interactive dashboard
- Consumer management
- Meter reading management
- Electricity billing management
- Automatic electricity consumption calculation
- Automatic bill calculation
- Payment status tracking
- Create, Read, Update, and Delete (CRUD) operations
- Search and filter functionality
- Single-record viewing
- Duplicate record prevention
- Input validation
- Linked record protection
- Dark and light mode
- Card and table views
- Responsive website design
- Printable billing details
- Automatic sample data insertion

## Technologies Used

| Technology | Purpose |
|---|---|
| Python | Backend programming |
| Flask | Web application framework |
| Firebase Cloud Firestore | NoSQL cloud database |
| Firebase Admin SDK | Database connectivity |
| HTML5 | Website structure |
| CSS3 | Styling and responsive design |
| JavaScript | Frontend functionality |
| PyCharm | Development environment |
| GitHub | Source code management |

## Database Structure

The system uses three interconnected Firebase Firestore collections.

### 1. Consumers

Stores electricity consumer information.

| Field | Description |
|---|---|
| full_name | Consumer's full name |
| account_number | Unique account number |
| meter_number | Unique electricity meter number |
| address | Consumer address |
| contact_number | Contact number |
| email | Email address |
| consumer_type | Residential, Commercial, or Industrial |
| status | Active or Inactive |
| created_at | Record creation timestamp |
| updated_at | Record modification timestamp |

### 2. Meter Readings

Stores electricity consumption records.

| Field | Description |
|---|---|
| consumer_id | Reference to the consumer |
| previous_reading | Previous meter reading |
| current_reading | Current meter reading |
| consumption_kwh | Calculated electricity consumption |
| reading_date | Meter reading date |
| billing_month | Billing month |
| rate_per_kwh | Electricity rate per kilowatt-hour |
| created_at | Record creation timestamp |
| updated_at | Record modification timestamp |

### 3. Bills

Stores electricity billing and payment information.

| Field | Description |
|---|---|
| consumer_id | Reference to the consumer |
| reading_id | Reference to the meter reading |
| billing_month | Billing period |
| consumption_kwh | Total electricity consumption |
| rate_per_kwh | Electricity rate |
| additional_charge | Additional billing charges |
| total_amount | Total electricity bill |
| due_date | Payment deadline |
| payment_status | Paid, Unpaid, or Overdue |
| payment_date | Actual payment date |
| created_at | Record creation timestamp |
| updated_at | Record modification timestamp |

## Database Relationship

Consumers → Meter Readings → Bills

Each consumer can have multiple monthly meter readings. Each meter reading can have one corresponding electricity bill. The system prevents duplicate monthly readings and bills.

An internal `_system` collection is used for Firestore transaction coordination.

## Electricity Billing Formula

**Electricity Consumption:**

Consumption (kWh) = Current Reading − Previous Reading

**Total Electricity Bill:**

Total Amount = (Consumption × Rate per kWh) + Additional Charges

### Sample Calculation

| Description | Value |
|---|---:|
| Previous reading | 1,000 kWh |
| Current reading | 1,150 kWh |
| Total consumption | 150 kWh |
| Rate per kWh | ₱11.50 |
| Additional charge | ₱50.00 |
| Total electricity bill | ₱1,775.00 |

The electricity rates used in this project are illustrative and intended for educational purposes.

## Installation and Setup

### Step 1: Open the Project

Open the PowerTrack project folder using PyCharm.

### Step 2: Install Dependencies

Open the PyCharm terminal and execute:

```powershell
py -m pip install -r requirements.txt
```

Python 3.11 or later is recommended.

### Step 3: Configure Firebase Firestore

1. Open the Firebase Console.
2. Create or select your Firebase project.
3. Enable Cloud Firestore.
4. Open Project Settings.
5. Select Service Accounts.
6. Generate a new private key.
7. Save the downloaded JSON file in the project folder as `ServiceAccountKey.json`.

### Step 4: Configure Environment Variables

Create a `.env` file containing:

```env
GOOGLE_APPLICATION_CREDENTIALS=ServiceAccountKey.json
PORT=5009
```

### Step 5: Insert Sample Data

Run the following command to automatically populate Firestore with sample records:

```powershell
py seed_data.py
```

The sample data generator provides:

- 15 sample consumers
- 15 sample meter readings
- 15 sample electricity bills
- Residential, commercial, and industrial consumers
- Sample payment statuses
- Automatically calculated electricity bills

This step is optional. Existing sample records for the current billing month are reused to prevent duplication.

### Step 6: Run the Flask Application

Execute the following command:

```powershell
py app.py
```

## Website URL

Open the PowerTrack website using the following link:

[PowerTrack Website](http://127.0.0.1:5009/)

## Firestore Connection Test

Verify the database connection using:

[Firestore Connection Status](http://127.0.0.1:5009/api/health)

Expected response:

```json
{
    "ok": true
}
```

## Server Configuration

| Configuration | Value |
|---|---|
| Application | PowerTrack |
| Theme | Crimson Circuit |
| Host | 127.0.0.1 |
| Port | 5009 |
| Debug Mode | Disabled |
| Database | Firebase Cloud Firestore |
| Deployment | Local Flask Server |

## Project Structure

```text
PowerTrack/
├── app.py
├── firebase_config.py
├── seed_data.py
├── main.py
├── requirements.txt
├── README.md
├── .env
├── .env.example
├── .gitignore
├── ServiceAccountKey.json
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/health | Check database connection |
| GET | /api/consumers | Retrieve consumers |
| POST | /api/consumers | Add consumer |
| GET | /api/meter_readings | Retrieve meter readings |
| POST | /api/meter_readings | Add meter reading |
| GET | /api/bills | Retrieve bills |
| POST | /api/bills | Create electricity bill |
| GET | /api/{collection}/{id} | View individual record |
| PUT | /api/{collection}/{id} | Update record |
| DELETE | /api/{collection}/{id} | Delete record |

## Security and Data Validation

The system implements the following security and validation measures:

- Firebase service account authentication
- Environment variable configuration
- Required field validation
- Email and contact number validation
- Duplicate account and meter number prevention
- Duplicate monthly reading prevention
- Duplicate monthly bill prevention
- Nonnegative numerical input validation
- Payment date validation
- Firestore transaction-based operations
- Protection against deleting linked records

The following files must not be uploaded to GitHub:

```gitignore
.env
ServiceAccountKey.json
.venv/
__pycache__/
.idea/
*.pyc
```

## Scope and Limitations

PowerTrack focuses on electricity consumer management, meter reading records, billing calculations, and payment status monitoring.

The system requires an internet connection to communicate with Firebase Cloud Firestore. Meter readings and payment information are entered manually. It does not include physical electricity meter integration, automatic hardware readings, or online payment processing.

The application is intended for local academic demonstration and does not currently include user login authentication. It should not be exposed publicly without additional security measures.

## System Testing

The following operations should be verified before submission:

- Firebase Firestore connectivity
- Adding, viewing, updating, and deleting consumer records
- Recording monthly meter readings
- Automatic electricity consumption calculation
- Automatic electricity bill calculation
- Updating payment status
- Searching and filtering records
- Preventing duplicate records
- Preventing invalid meter readings
- Protecting linked database records
- Responsive website layout

## Academic Information

**Project Title:** PowerTrack — Electricity Consumption and Billing Management System

**Subject:** Advanced Database

**Activity:** Final Practical Activity

**Database:** Firebase Cloud Firestore

**Academic Year:** 2026–2027

## Conclusion

PowerTrack demonstrates the practical implementation of a cloud-based NoSQL database using Firebase Firestore and Python Flask. It integrates interconnected collections, CRUD operations, data validation, automated billing calculations, and an interactive web interface into a centralized electricity consumption and billing management system.

---

**PowerTrack — Crimson Circuit**

*Track Consumption. Manage Bills. Power Smarter.*