# Error Code Classification & Routing System

This document specifies the abstract four-digit error taxonomy used across the translation pipeline, metrics database, and automated arbitration engines.

## 1. Domain Allocation Overview

| Code Range   | Subsystem Domain       | Description                                                              | Component Attribution           |
| :----------- | :--------------------- | :----------------------------------------------------------------------- | :------------------------------ |
| `1000..1999` | **Internal Gateway**   | Worker runtime exceptions, CPU limits, missing configs, parse failures.  | Translation API Gateway         |
| `2000..2999` | **Internal Storage**   | Cloudflare D1 timeouts, Turso database connection issues (internalized). | Translation API Gateway         |
| `3000..3999` | **Google Upstream**    | Google Translate Public & Web endpoint 5xx, rate limits, timeouts.       | Google Translate (Public & Web) |
| `4000..4999` | **Microsoft Upstream** | Microsoft Edge Translator handshake errors, rate limits, timeouts.       | Microsoft Translator (Edge NMT) |
| `5000..5999` | **DeepL Upstream**     | DeepL HTTP 5xx, quota exhaustion, authorization errors.                  | DeepL Translation Service       |

---

## 2. Error Code Catalog

### 1000..1999: Gateway Internal Exceptions

- **`1001`**: **Unhandled Runtime Exception**
  - Triggered when an uncaught error escapes the translation pipeline or stream generator.
- **`1002`**: **Execution Limit Exceeded**
  - Worker CPU time or memory threshold exceeded during heavy segment tokenization.
- **`1003`**: **Missing Secret or Configuration**
  - Required environment variables or active secret rotation keys missing from the Worker context.
- **`1004`**: **Payload Parse or Cue Extraction Failure**
  - Incoming request payload contains malformed cues, invalid JSON, or unparseable subtitle content.

### 2000..2999: Storage Subsystem (Internalized)

- **`2001`**: **Cloudflare D1 Query Timeout**
  - Session verification or reputation IP shield query exceeded timeout.
- **`2002`**: **Cloudflare D1 Internal Error**
  - D1 database connection dropped or returned SQLITE_BUSY / internal fault.
- **`2003`**: **Turso Metrics Write Timeout**
  - Asynchronous metrics pipeline write to Turso exceeded HTTP timeout threshold.
- **`2004`**: **Turso Auth or Connection Error**
  - Turso token rejected or endpoint connection reset.

### 3000..3999: Google Translate Upstream

- **`3001`**: **Google Upstream HTTP 5xx**
  - Google endpoint returned 500, 502, or 503 error status.
- **`3002`**: **Google Rate Limit Exceeded (HTTP 429)**
  - Google endpoint returned HTTP 429 Too Many Requests.
- **`3003`**: **Google Connection Timeout**
  - Upstream request exceeded the network timeout window (>8000ms).
- **`3004`**: **Google Response Format Anomaly**
  - Google returned empty text or response body did not match the translation grammar.

### 4000..4999: Microsoft Translator Upstream

- **`4001`**: **Microsoft Upstream HTTP 5xx**
  - Microsoft Edge translator service returned HTTP 500 or 503.
- **`4002`**: **Microsoft Rate Limit (HTTP 429)**
  - Microsoft Edge endpoint returned HTTP 429.
- **`4003`**: **Microsoft Handshake / Auth Timeout**
  - Edge auth token acquisition or connection handshake failed.
- **`4004`**: **Microsoft Response Format Anomaly**
  - Returned translation payload was empty or rejected.

### 5000..5999: DeepL Translation Upstream

- **`5001`**: **DeepL HTTP 5xx Server Error**
  - DeepL API returned 500 or 503.
- **`5002`**: **DeepL Quota Exceeded (HTTP 456)**
  - Monthly translation character limit reached.
- **`5003`**: **DeepL Authorization Error (HTTP 401/403)**
  - DeepL API key invalid or forbidden.
- **`5004`**: **DeepL Connection Timeout**
  - DeepL API endpoint unreachable or timed out.
