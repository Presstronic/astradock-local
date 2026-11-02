# Owner-provided MedPen purchase example

| Field | Value |
| --- | --- |
| Evidence ID | `CAP-2026-10-29-03` |
| Date | 2026-10-29 |
| Collection | Owner report and copied normalized overlay messages; not another timed raw-log capture |
| Owner-confirmed action | Bought five MedPens |
| Quoted item class | `crlf_consumable_healing_01` |
| Quoted requested quantity | 5 |
| Quoted client price | 1195; basis/currency and actual debit remain unverified |
| Quoted response | `Buying`, `Success`, `BuyRequestProcessing` |
| Shop vocabulary | `SCShop_Pyro_RestStop_BlackMarket_FPSItems` |
| Original source records | Not supplied in the report; do not label the copied normalized messages as raw log text |
| Exact time / client build | Not independently supplied for this example |
| Product decision | Lookup maps the class to MedPen/MedPens; one parameterized purchase template; Friendly/Raw switch beside opacity |

Record `OWN-04`: owner confirmed buying five MedPens. This supports the name mapping and the requested friendly wording, not an invented automated wallet/debit detector.

The [message reference](overlay-message-reference.md) defines request/response association and raw evidence boundaries. Synthetic tests reproduce the supplied class/count/price/response fields with obvious synthetic identities; they are not copies of original source records from this purchase.
