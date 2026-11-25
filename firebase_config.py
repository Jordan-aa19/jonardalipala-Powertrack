import os
import json
import logging

from pathlib import Path
from functools import lru_cache
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore


BASE = Path(__file__).resolve().parent

load_dotenv(BASE / ".env")


@lru_cache(maxsize=1)
def get_db():

    try:

        try:
            firebase_app = firebase_admin.get_app()

        except ValueError:

            # VERCEL ENVIRONMENT VARIABLE
            firebase_json = os.getenv(
                "FIREBASE_SERVICE_ACCOUNT", ""
            ).strip()

            if firebase_json:

                service_account = json.loads(
                    firebase_json
                )

                cred = credentials.Certificate(
                    service_account
                )

            else:

                # LOCAL PYCHARM CONFIGURATION
                credential_path = os.getenv(
                    "GOOGLE_APPLICATION_CREDENTIALS",
                    "ServiceAccountKey.json"
                )

                path = Path(credential_path)

                if not path.is_absolute():
                    path = BASE / path

                if not path.is_file():
                    raise FileNotFoundError(
                        "Firebase Service Account file not found."
                    )

                cred = credentials.Certificate(
                    str(path)
                )

            firebase_app = firebase_admin.initialize_app(
                cred
            )

        db = firestore.client(app=firebase_app)

        logging.info("Firebase initialized successfully.")

        return db

    except Exception:

        logging.exception("Firebase connection failed.")

        raise
