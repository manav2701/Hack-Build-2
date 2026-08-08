# ElevenLabs Agent Tools Configuration

This document contains the exact JSON configurations used for the 3 tools registered on the ElevenLabs Agent Dashboard for agent `agent_1401kzetahref6nb0pvsc85ennaf`.

---

## Tool 1: `start_research` (Webhook)

**Purpose**: Kicks off live parallel research for a product or food craving.

| Field | Value |
|---|---|
| Type | Webhook (POST) |
| URL | `https://hack-build-2-production.up.railway.app/v1/tools/start_research` |
| Timeout | 20 seconds |
| Header | `X-Dalal-Key: dalal-secret-123` |

**Body Parameters**:
| ID | Type | Required | Description |
|---|---|---|---|
| `category` | string | ✅ | Category e.g. laptop, vacuum, headphones, or food |
| `dish` | string | ❌ | Specific product name or food craving |
| `budget_aed` | number | ❌ | Target budget in AED |

<details>
<summary>Full JSON (click to expand)</summary>

```json
{
  "type": "webhook",
  "name": "start_research",
  "description": "Kick off live parallel research for a product or food craving.",
  "response_timeout_secs": 20,
  "api_schema": {
    "url": "https://hack-build-2-production.up.railway.app/v1/tools/start_research",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Research query payload",
      "required": true,
      "properties": [
        {
          "id": "category",
          "type": "string",
          "description": "Category e.g. laptop, vacuum, headphones, or food",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": true,
          "enum": null
        },
        {
          "id": "dish",
          "type": "string",
          "description": "Specific product name or food craving",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": false,
          "enum": null
        },
        {
          "id": "budget_aed",
          "type": "number",
          "description": "Target budget in AED",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": false,
          "enum": null
        }
      ],
      "value_type": "llm_prompt"
    },
    "request_headers": [
      {
        "type": "value",
        "name": "X-Dalal-Key",
        "secret_id": "",
        "value": "dalal-secret-123"
      }
    ],
    "content_type": "application/json",
    "auth_connection": null
  },
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  },
  "assignments": [],
  "interruption_mode": "allow",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "response_mocks": []
}
```

</details>

---

## Tool 2: `get_verdict` (Webhook)

**Purpose**: Fetches the completed research verdict or current status for a job.

| Field | Value |
|---|---|
| Type | Webhook (POST) |
| URL | `https://hack-build-2-production.up.railway.app/v1/tools/get_verdict` |
| Timeout | 20 seconds |
| Header | `X-Dalal-Key: dalal-secret-123` |

**Body Parameters**:
| ID | Type | Required | Description |
|---|---|---|---|
| `job_id` | string | ✅ | The research job ID returned by start_research |

<details>
<summary>Full JSON (click to expand)</summary>

```json
{
  "type": "webhook",
  "name": "get_verdict",
  "description": "Fetch the completed verdict or current status for a research job.",
  "response_timeout_secs": 20,
  "api_schema": {
    "url": "https://hack-build-2-production.up.railway.app/v1/tools/get_verdict",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Verdict request payload",
      "required": true,
      "properties": [
        {
          "id": "job_id",
          "type": "string",
          "description": "The research job ID returned by start_research",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": true,
          "enum": null
        }
      ],
      "value_type": "llm_prompt"
    },
    "request_headers": [
      {
        "type": "value",
        "name": "X-Dalal-Key",
        "secret_id": "",
        "value": "dalal-secret-123"
      }
    ],
    "content_type": "application/json",
    "auth_connection": null
  },
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  },
  "assignments": [],
  "interruption_mode": "allow",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "response_mocks": []
}
```

</details>

---

## Tool 3: `open_order_page` (Client Tool)

**Purpose**: Opens the winning deal or restaurant page in the user's browser.

| Field | Value |
|---|---|
| Type | Client Tool |
| Wait for response | Off |

**Parameters**:
| ID | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✅ | The URL of the winning deal or restaurant order page |

> **Note**: This tool is configured via the ElevenLabs UI form (not JSON mode). It runs client-side via `@elevenlabs/react` and triggers `window.open(url)` in the user's browser.

---

## Environment Variables

### Backend (Railway — `apps/api`)
| Variable | Value |
|---|---|
| `SUPABASE_URL` | `<your-supabase-project-url>` |
| `SUPABASE_KEY` | `<your-supabase-secret-key>` |
| `CONTEXT_DEV_API_KEY` | `<your-context-dev-api-key>` |
| `DALAL_SECRET_KEY` | `dalal-secret-123` |
| `USE_FIXTURES` | `false` |

### Frontend (Vercel — `apps/web`)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | `<your-elevenlabs-agent-id>` |
| `NEXT_PUBLIC_SUPABASE_URL` | `<your-supabase-project-url>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<your-supabase-publishable-key>` |
| `NEXT_PUBLIC_API_URL` | `https://hack-build-2-production.up.railway.app` |
