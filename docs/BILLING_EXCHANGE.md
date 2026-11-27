# Billing exchange v1

Open Billing exchange for a saved revision quote. JSON and CSV exports require
locally recorded acceptance and a saved customer. Editable quote-form values are
not used. Export verifies the manifest, acceptance history and recomputed costing
against the saved snapshot. It changes no job, quote or external billing system.

This is a generic adapter contract, not a native Lexware, DATEV or other vendor
format. Import adapters must map customer/account identifiers, assign invoice
numbers and supply their own tax/delivery information. These exports contain no
invoice or payment record.

## JSON mappings

| Field | Meaning |
| --- | --- |
| `format`, `version` | `terratec-billing-exchange`, `1` |
| `exportKey` | `terratec:quote:<quote UUID>`; deduplication key |
| `documentKind` | `billing-handoff` |
| `source` | Job ID/name, revision, quote UUID/date, acceptance date and model hash |
| `customer` | Saved recipient, contact, local customer ID, reference and notes |
| `currency` | EUR, USD or GBP; no conversion |
| `lines[].quantity`, `unit` | Integer quantity in sheets, handles, minutes, mm or lots |
| `lines[].rateCents`, `ratePerUnits` | Minor-unit rate per this many quantity units |
| `lines[].amountCents` | Authoritative rounded line amount in minor units |
| `subtotalCents` | Cost subtotal before markup |
| `markupCents` | Saved markup, also represented as one line |
| `netCents` | Sum of all line amounts, including markup |
| `tax` | `excluded-unspecified`; amount null, not zero-rated |
| `invoiceNumber` | null; no invoice number allocated |

Stock sheets retain batch/material/dimension descriptions. Profile and edging
quantities use integer millimetres with rates per 1000 mm. Labour uses integer
minutes with its rate per 60 minutes. The saved line amounts carry rounding from
the quote; sum `amountCents` rather than recalculating from displayed decimals.
Zero-priced lines remain present.

Repeating an export retains its key. Restoring a job backup creates a new local
job ID but preserves the quote UUID, so the billing key also survives restoration.
A newly saved quote has a new UUID. Adapters should check for an existing key before
creating a billing document; the exporter does not maintain an external import log.
Local acceptance is a tracking entry, not authenticated customer authorization.

## CSV mappings

UTF-8 with BOM, comma delimiter, double-quoted cells, CRLF record separators.
Embedded quotes double; multiline fields stay inside quoted cells. User text that
could be interpreted as a spreadsheet formula receives an apostrophe prefix.
JSON retains the original saved text for integrations requiring exact strings.

Each data row is one charge line. Document context repeats on each row:
`export_key`, `document_kind`, `job_id`, `job_name`, `revision`, `quote_id`,
`source_sha256`, `customer_id`, `customer`, `customer_contact`, `reference`,
`notes`, `currency`, `tax_status`.

Line columns are `line`, `category`, `description`, `quantity`, `unit`,
`rate_cents`, `rate_per_units`, `line_net_cents`. Sum `line_net_cents` once per
`export_key`; there is no duplicate document-total row. All monetary CSV values
are integer minor units without thousands separators or currency conversion.

Supported categories: `sheet`, `hardware`, `labour`, `profile`, `edging-material`,
`edging-labour`, `markup`. Missing optional categories mean they were excluded
from the quote, rather than estimated by the billing exporter.
