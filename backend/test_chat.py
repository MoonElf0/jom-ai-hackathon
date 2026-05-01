import requests, json

r = requests.post(
    'http://localhost:5000/api/ai/chat',
    json={'messages': [{'role': 'user', 'content': 'List sheltered basketball courts in Tampines'}]}
)
print(json.dumps(r.json(), indent=2))
