from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse
from openai import OpenAI
import requests
import csv
import time
import os

# 🔑 OPENAI API KEY (Extracted from your script)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "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")
client = OpenAI(api_key=OPENAI_API_KEY)

# 📁 SENT LOG FILE
SENT_LOG_FILE = "sent_log.csv"

def is_already_sent(phone):
    try:
        if not os.path.exists(SENT_LOG_FILE): return False
        with open(SENT_LOG_FILE, "r") as file:
            for line in file:
                if phone.strip() == line.strip():
                    return True
    except:
        return False
    return False

def mark_as_sent(phone):
    with open(SENT_LOG_FILE, "a") as file:
        file.write(phone + "\n")

def send_outbound_message(phone, name):
    url = "https://api.interakt.ai/v1/public/message/"
    headers = {
        "Authorization": f"Basic {os.environ.get('INTERAKT_API_KEY', 'YOUR_INTERAKT_API_KEY')}",
        "Content-Type": "application/json"
    }
    data = {
        "countryCode": "+91",
        "phoneNumber": phone,
        "type": "Template",
        "template": {
            "name": "real_estate_outreach",
            "languageCode": "en",
            "bodyValues": [name]
        }
    }
    response = requests.post(url, headers=headers, json=data)
    print(f"Sent to {phone}: {response.text}")

def send_bulk_messages(limit=200):
    count = 0
    if not os.path.exists("contacts.csv"):
        print("contacts.csv not found!")
        return
    with open("contacts.csv", newline='', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            if count >= limit: break
            name = row.get("name", "")
            phone = row.get("phone", "")
            if is_already_sent(phone): continue
            send_outbound_message(phone, name)
            mark_as_sent(phone)
            count += 1
            time.sleep(2)
    print(f"Total sent today: {count}")

# This part can be triggered via a script or integrated into FastAPI
if __name__ == "__main__":
    # If run directly, can execute bulk send
    # send_bulk_messages(limit=200)
    pass
