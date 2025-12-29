#!/bin/bash

# Usage: ./send-email.sh <RESEND_API_KEY>
# Example: ./send-email.sh re_your_api_key_here

if [ -z "$1" ]; then
  echo "Error: RESEND_API_KEY required"
  echo "Usage: $0 <RESEND_API_KEY>"
  exit 1
fi

API_KEY="$1"

curl -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
      "from": "Can Vardar <can@relic.so>",
      "to": "me@icanvardar.com",
      "subject": "Test",
      "html": "<p>Test email</p>"
    }'
