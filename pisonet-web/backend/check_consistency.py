import json
import sys

peso_to_seconds = float(sys.argv[1])
with open('transactions_sample.json') as f:
    txns = json.load(f)

computed = {}
for txn in txns:
    uid = txn['unit_id']
    amount = txn['amount']
    ttype = txn['transaction_type']
    
    val = 0
    if ttype in ['admin_add', 'admin_deduct']:
        val = (amount * 60) / peso_to_seconds
    else:
        val = amount
        
    computed[uid] = computed.get(uid, 0) + val

import requests
try:
    resp = requests.get('http://localhost:3000/api/transactions/revenue/by-unit', timeout=5)
    api_data = resp.json()
except Exception as e:
    print(f"API Error: {e}")
    sys.exit(1)

# api_data is expected to be list of {unit_id, total_revenue} or similar
# mapping it to dict
api_rev = {item.get('unit_id'): item.get('total_revenue') for item in api_data}

mismatches = []
all_matched = True
for uid, comp_val in computed.items():
    api_val = api_rev.get(uid, 0)
    if abs(comp_val - api_val) > 0.0001:
        mismatches.append(f"Unit {uid}: Computed={comp_val:.4f}, API={api_val:.4f}")
        all_matched = False

if all_matched:
    print("All matched:")
    for uid, comp_val in computed.items():
        print(f" Unit {uid}: {comp_val:.4f}")
else:
    print("Mismatches found:")
    for m in mismatches:
        print(f" {m}")
