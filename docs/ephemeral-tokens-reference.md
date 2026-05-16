# Gemini Live API — Ephemeral Tokens for Client-Side Connection

## Architecture
1. Client authenticates with YOUR backend
2. YOUR backend requests ephemeral token from Gemini API (using your GEMINI_API_KEY)
3. Gemini returns a short-lived token
4. Your backend sends token to client
5. Client connects DIRECTLY to Gemini Live API using the @google/genai SDK with the ephemeral token

## Key: Client connects DIRECTLY to Gemini — no server proxy needed!

## Create Ephemeral Token (Server-Side, Python example — need to find Node.js equivalent)
```python
client = genai.Client(http_options={'api_version': 'v1alpha'})
token = client.auth_tokens.create(
    config={
        'uses': 1,
        'expire_time': now + timedelta(minutes=30),
        'new_session_expire_time': now + timedelta(minutes=1),
        'http_options': {'api_version': 'v1alpha'},
        'live_connect_constraints': {
            'model': 'gemini-3.1-flash-live-preview',
            'config': {
                'session_resumption': {},
                'temperature': 0.7,
                'response_modalities': ['AUDIO']
            }
        }
    }
)
# token.name is the ephemeral token string
```

## Connect from Client (JavaScript — using @google/genai SDK)
```javascript
import { GoogleGenAI, Modality } from '@google/genai';

// Use the ephemeral token as the API key
const ai = new GoogleGenAI({
  apiKey: token.name  // ephemeral token from server
});

const model = 'gemini-3.1-flash-live-preview';
const config = { responseModalities: [Modality.AUDIO] };

async function main() {
  const session = await ai.live.connect({
    model: model,
    config: config,
    callbacks: { ... },
  });

  // Send content...
  session.close();
}
```

## Important Notes
- Ephemeral tokens can also be passed as `access_token` query parameter or in HTTP `Authorization` header prefixed by `auth-scheme` `Token`
- Token valid for 1 minute to start new sessions, 30 minutes for the session itself
- Uses the @google/genai SDK on the client side with the ephemeral token as apiKey
- Model: gemini-3.1-flash-live-preview
- Can lock ephemeral token to specific model/config constraints on server side
- Need session_resumption for reconnecting within the expireTime window (every 10 minutes)

## Best Practices
- Set short expiration duration using expire_time
- Tokens expire, requiring re-initiation of the provisioning process
- Verify secure authentication for your own backend
- Avoid using ephemeral tokens for backend-to-Gemini connections (use API key directly)
