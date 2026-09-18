
# Иван Бани — Management Accounting Workbook V1 & FinDir Integration Contract

**Status:** draft for FinDir architect review  
**Canonical issue:** #4  
**Branch:** docs/ivan-bani-findir-contract-v1  
**Date:** 2026-09-18  
**Scope:** target workbook architecture + contract for universal FinDir integration  
**Important:** current workbook «Бани май» is a prototype and is not the target operating model.

---

# 1. Executive decision

For Ivan Bani we do **not** build a separate client application now.

First we build and validate the operating process in one Google Sheets workbook. The workbook is allowed to be technically large and complex because the primary human operator is an economist / finance employee, not the owner.

The owner should consume the data through FinDir:

~~~text
Economist
  ↓
Google Sheets operating workbook
  ↓
self-describing workbook contract (_FINDIR_META)
  ↓
immutable FinDir snapshot
  ↓
deterministic extraction / calculations / reconciliation
  ↓
validated owner read model
  ↓
MAX and, if justified, configurable Mini App
~~~

The objective is **not** to make the Google workbook beautiful for the owner. The objective is to make it a reliable operating source which FinDir can understand and verify.

---

# 2. Product principles

## 2.1 One workbook, not hundreds of object tabs

The target workbook contains 12 monthly object sheets plus shared technical sheets.

We intentionally do **not** create one sheet per object.

## 2.2 The object belongs to the month of contract signing

The monthly sheet is an object cohort, not a cash period.

Example:

~~~text
Contract signed: May
Materials paid: March / April
Advance received: May
Delivery paid: June
Final payment received: July
Object closed: July
~~~

The object remains on **05_Май** forever.

It may contain cash movements in March, April, May, June, July etc.

**Objects are never moved between monthly sheets.**

## 2.3 V1 is cash-first

Ivan's current primary management need is cash visibility.

Therefore V1 intentionally avoids a sophisticated dual-entry workflow for separate accrual P&L and cash flow.

Human input is built around actual money:

- customer actually paid → record the receipt in the actual month;
- materials actually paid → record the payment in the actual month;
- delivery actually paid → record the payment in the actual month;
- installation actually paid → record the payment in the actual month;
- manager commission → record according to the approved operating rule;
- shared company cost actually paid → record it in the actual month on the shared-cost sheet.

Derived management metrics may still be calculated by formulas / FinDir, but employees should not have to maintain two parallel financial ledgers.

## 2.4 LLM is not financial authority

This inherits the current FinDir architecture:

~~~text
LLM_FINANCIAL_AUTHORITY=0
PRESENTATION_LAYER_FINANCIAL_CALCULATION=0
~~~

Qwen / another LLM may understand the owner's question, choose an allowed deterministic query, interpret validated findings and explain results.

Qwen must not author official numbers by summing arbitrary workbook cells itself.

---

# 3. Target workbook topology

Recommended workbook structure:

~~~text
01_Январь
02_Февраль
03_Март
04_Апрель
05_Май
06_Июнь
07_Июль
08_Август
09_Сентябрь
10_Октябрь
11_Ноябрь
12_Декабрь

Общие расходы
Справочники
Сводный
Контроль
_FINDIR_META
~~~

An optional human-readable **Правила** sheet may be added if useful, but the canonical machine contract is **_FINDIR_META**.

No separate materials sheet is planned for V1.

No separate owner-facing Google dashboard is required for V1; it may remain as a test/control surface only.

---

# 4. Monthly object sheet contract

Each monthly sheet contains all objects whose contracts were signed in that month.

Example:

~~~text
05_Май

[OBJ-2026-05-001] Иванов | Парус 6x2.4 | Менеджер | Договор 700 000 | Статус
    Получено от клиента
    Материалы
    Работы цеха
    Сборка / монтаж
    Доставка
    Сваи
    ГСМ
    Суточные / жилье
    Прочие прямые расходы
    Комиссия менеджера
    Прочие объектные выплаты
    --------------------------------
    Текущий денежный результат объекта

[OBJ-2026-05-002] ...
~~~

Rows belonging to an object are grouped using native Google Sheets row grouping.

The economist normally sees collapsed object headers and expands only the object being edited.

---

# 5. Object header

Every object must have a stable **Object_ID**.

Minimum header fields:

| Field | Meaning |
|---|---|
| Object_ID | permanent unique ID, never reused |
| Client | client / contract party |
| Product | bath / product type |
| Manager | responsible sales manager |
| Contract date | date the contract was signed |
| Contract value | contractual value |
| Status | current operating state |
| Act signed | yes/no, if applicable |
| Act date | if applicable |
| Closed | final operating closure flag |
| Comment | free operational note |

Recommended ID:

~~~text
OBJ-2026-05-001
~~~

Names are not identifiers.

---

# 6. Status model

Initial status dictionary:

~~~text
Договор
Производство
Готов
Доставлен
Смонтирован
Акт подписан
Оплачен
Закрыт
~~~

This may be adjusted after real use.

UX requirements:

- status is selected from a controlled dropdown;
- **Закрыт** is visually green;
- closed object blocks can be collapsed;
- desirable convenience action: **Свернуть все закрытые объекты**;
- this convenience may use Apps Script, but financial calculations must not depend on Apps Script.

The status is operational context, not proof that financial data are complete.

The **Контроль** sheet must flag suspicious states, for example a closed object with non-zero contract balance or missing required financial data.

---

# 7. Month axis inside an object

Each object block must expose the 12 calendar months as the cash period axis.

Conceptually:

| Category | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Customer receipts | | | | | 50 000 | | 650 000 | | | | | | 700 000 |
| Materials | | | 80 000 | 120 000 | | | | | | | | | 200 000 |
| Delivery | | | | | | 40 000 | | | | | | | 40 000 |

Therefore:

- an object on **05_Май** may contain March and April material payments;
- the May cohort view and the calendar cash view remain different filters over the same source;
- all cash data retain their actual month.

---

# 8. Cash-first object semantics

## 8.1 Customer money

Input:

- actual customer receipts by calendar month.

Derived:

~~~text
received_total = SUM(monthly customer receipts)
contract_balance_to_receive = contract_value - received_total
~~~

For V1, **contract_balance_to_receive** means management balance still expected under the contract.

It is not automatically equal to formal accounting receivables.

The status and act fields provide context.

## 8.2 Direct object payments

Initial categories:

~~~text
materials
direct_shop_work
assembly
delivery
piles
assembler_fuel
per_diem_and_lodging
direct_unforeseen
manager_commission
other_direct_object_payment
~~~

Categories must be controlled through **Справочники**.

## 8.3 Object cash result

A simple direct result can be derived:

~~~text
object_cash_result_before_common =
    customer_receipts
  - direct_object_cash_outflows
~~~

This is not necessarily formal Net Profit.

Any allocated company overhead or calculated tax must be separately identified as a derived management layer.

---

# 9. Materials — explicit V1 decision

There is **no separate materials ledger in V1**.

Current rule:

> If a material payment is attributable to an object, it is recorded inside that object's block in the month when the cash was actually paid — even if the payment occurred before the contract month.

Example:

~~~text
Object is in May sheet.
Materials were paid in March.
March column of this May object contains the material payment.
~~~

This gives the owner a straightforward cash history.

## Open material question

Ivan must clarify the real operating process:

> Are materials usually purchased for a specific object, or are materials frequently purchased into a common pool / stock before the future object is known?

If common-pool purchasing is material, V1 needs an explicit rule before production use.

We must **not fabricate object attribution** merely to make the report balance.

A future unallocated-materials pool / simple materials balance may be added only if the real process requires it.

---

# 10. Shared company expenses

**Общие расходы** is a separate operating sheet.

It contains actual monthly cash outflows not directly attached to one object.

Initial categories may include:

~~~text
rent
supply / procurement function
management
documents
executive management
central marketing
non-object payroll
tax payments
other shared operating expenses
~~~

The exact dictionary is maintained in **Справочники**.

These costs must not be silently included in direct object COGS.

If FinDir calculates an allocated object result, the allocation method must be explicit and deterministic.

---

# 11. Technical summary sheet

**Сводный** is a technical aggregation layer, not the primary data-entry surface.

It should deterministically derive at least:

- cash received by calendar month;
- cash paid by calendar month;
- net cash movement by calendar month;
- objects by contract month;
- direct object result;
- object contract balance to receive;
- objects by manager;
- objects by product type;
- closed / open objects;
- profitable / loss-making objects under the approved management-result definition;
- shared costs;
- selected management margins.

The summary must not contain manually typed canonical financial totals.

---

# 12. Control sheet

**Контроль** must expose reconciliation and data-quality checks.

Minimum checks:

1. duplicate Object_ID;
2. missing Object_ID;
3. invalid status;
4. object marked closed with unresolved contract balance;
5. object marked closed with missing mandatory cost review;
6. negative or structurally impossible contract balance;
7. formula errors;
8. cash totals by month reconcile across all 12 object sheets + shared expenses;
9. no object appears on two cohort sheets;
10. manager exists in reference table;
11. product type exists in reference table;
12. category exists in reference table;
13. workbook/meta schema versions match;
14. structure fingerprint matches the active profile.

No owner-facing report should silently publish a materially broken workbook.

---

# 13. _FINDIR_META — self-describing workbook contract

The workbook must explain itself to FinDir.

**_FINDIR_META** is machine-readable evidence and configuration. It is **not allowed to bypass deterministic validation**.

Suggested top-level keys:

~~~text
schema_name                     ivan_bani_management
schema_version                  1
currency                        RUB
timezone                        Europe/Moscow
accounting_mode                 cash_first

object_partition_basis          contract_month
object_id_field                 Object_ID
period_axis                     calendar_month
period_granularity              month

shared_expense_sheet            Общие расходы
reference_sheet                 Справочники
summary_sheet                   Сводный
control_sheet                   Контроль

materials_mode                  object_attributed_cash_v1
formal_inventory_ledger         false

source_workbook_write_by_findir false
~~~

## 13.1 Sheet-role registry

| sheet pattern/name | role |
|---|---|
| 01_Январь…12_Декабрь | object_cohort_sheet |
| Общие расходы | shared_cash_costs |
| Справочники | dimensions |
| Сводный | derived_summary |
| Контроль | data_quality |
| _FINDIR_META | semantic_contract |

## 13.2 Object-block registry

The meta contract must describe:

- how an object block starts;
- where Object_ID is located;
- how header fields are identified;
- which rows are financial categories;
- where the 12 month axis is located;
- how the object block ends;
- which rows are manually entered vs derived.

Do not make FinDir guess if the workbook can declare the structure explicitly.

## 13.3 Category semantics

Every category receives a stable machine ID and owner label.

| metric/category ID | owner label | direction | scope |
|---|---|---|---|
| customer_receipt | Получено от клиента | inflow | object |
| materials | Материалы | outflow | object |
| assembly | Сборка / монтаж | outflow | object |
| delivery | Доставка | outflow | object |
| manager_commission | Комиссия менеджера | outflow | object |
| rent | Аренда | outflow | shared |

## 13.4 Status semantics

Meta must define allowed statuses and terminal status.

~~~text
terminal_status = Закрыт
~~~

## 13.5 Derived metrics

Definitions must use stable metric IDs, not fragile display text.

~~~text
received_total =
  SUM(customer_receipt)

contract_balance_to_receive =
  contract_value - received_total

direct_object_cash_outflows =
  SUM(materials, direct_shop_work, assembly, delivery, piles,
      assembler_fuel, per_diem_and_lodging, direct_unforeseen,
      manager_commission, other_direct_object_payment)

object_cash_result_before_common =
  received_total - direct_object_cash_outflows
~~~

FinDir must still independently validate inputs, formula results and reconciliation.

---

# 14. Contract with universal FinDir

The client-specific workbook must **not** require a permanent tenant-specific branch in the financial runtime.

Target architecture:

~~~text
Google workbook
    ↓
immutable snapshot
    ↓
_FINDIR_META + workbook evidence
    ↓
generic self-describing-workbook parser
    ↓
validated semantic profile
    ↓
canonical object / cash model
    ↓
deterministic financial queries
    ↓
Data Trust / reconciliation
    ↓
Adaptive Owner Read Model
    ↓
MAX / Mini App / conversational CFO
~~~

Client specificity should live in:

1. workbook data;
2. workbook semantic contract;
3. validated tenant profile;
4. owner-read-model configuration.

Not in copied financial-engine implementations.

---

# 15. Required canonical concepts for FinDir

The FinDir architect should confirm or adjust the canonical model, but Ivan Bani requires at least:

## Object / Project

~~~text
objectId
client
product
manager
contractDate
contractMonth
contractValue
status
actSigned
actDate
closed
~~~

## Cash fact

At minimum, FinDir must be able to reconstruct:

~~~text
objectId?        // null for shared company cash
calendarMonth
categoryId
direction        // inflow / outflow
amount
sourceEvidence
~~~

The physical Google representation may be a month matrix rather than one-row-per-transaction. The canonical runtime representation should not depend on that UI choice.

## Dimensions

~~~text
manager
productType
contractMonth
calendarCashMonth
objectStatus
category
~~~

This separation is what enables one workbook to answer multiple owner questions without rewriting formulas for each report.

---

# 16. Deterministic owner query library

Before arbitrary AI questions, FinDir should expose a strong deterministic query registry.

Candidate V1 queries:

~~~text
cash_summary(month)
objects_by_contract_month(month)
object_detail(object_id)
open_objects()
closed_objects()
contract_balance_to_receive()
contract_balance_by_object()
objects_by_manager(manager)
objects_by_product(product)
manager_summary(manager)
product_summary(product)
profitable_objects(period)
loss_making_objects(period)
shared_expenses(month)
cash_inflows(month)
cash_outflows(month)
cash_net(month)
data_quality_status()
~~~

Example owner flow in MAX:

~~~text
Что посмотреть?

[Деньги за месяц]
[Объекты]
[Кто должен]
[Менеджеры]
[Типы бань]
[Общие расходы]
[Что требует проверки]
~~~

After every answer, show context-sensitive next actions.

This gives reliable value even before free-form AI is perfect.

---

# 17. Free-form owner questions

The owner may ask:

> Какие объекты мая самые доходные?

or:

> Сколько денег пришло в июле по объектам, договоры которых были заключены в мае?

Correct pipeline:

~~~text
owner question
  ↓
LLM intent / query plan
  ↓
deterministic query registry / canonical model
  ↓
validated numeric result
  ↓
LLM explanation
~~~

Incorrect pipeline:

~~~text
owner question
  ↓
Qwen reads arbitrary cells
  ↓
Qwen performs unofficial arithmetic
  ↓
owner receives number
~~~

The latter is prohibited.

---

# 18. MAX vs Mini App

This decision does not need to block the workbook.

## Option A — deterministic MAX menu

Strengths:

- fastest to ship;
- good for repeated owner questions;
- natural for alerts;
- low UI complexity;
- strong determinism.

Weaknesses:

- poor for broad comparison of 15–30 objects;
- many button steps for drill-down;
- weaker visual overview.

## Option B — configurable Mini App

Strengths:

- much better overview;
- easy sorting/filtering;
- natural drill-down from company → month → object;
- good comparison by manager/product;
- owner can visually explore without knowing the correct question.

Weaknesses:

- larger product surface;
- must avoid client-specific code forks.

## Proposed product direction

Do **not** build 50 separate dashboards.

The FinDir architect should validate a config-driven **Adaptive Owner Read Model**.

Illustrative configuration:

~~~yaml
top_cards:
  - cash_in
  - cash_out
  - cash_net
  - contract_balance_to_receive
  - current_object_result

sections:
  - objects
  - managers
  - products
  - shared_expenses
  - data_quality

filters:
  - contract_month
  - cash_month
  - manager
  - product
  - status
~~~

The renderer is universal.

The client configuration selects available metrics, sections and filters.

Pragmatic rollout proposal:

~~~text
Stage 1:
MAX deterministic menu + free-form question routing

Stage 2:
Adaptive Mini App if owner behavior proves visual browsing is valuable

Stage 3:
MAX becomes entry / alert / conversation surface,
Mini App becomes visual exploration surface
~~~

Workbook and canonical contracts must support both from day one.

---

# 19. Required decision from FinDir architect

Architect review should answer these explicitly.

## A. Self-describing workbook

Can the existing semantic-profile lifecycle accept a workbook-defined **_FINDIR_META** contract as high-priority semantic evidence while preserving validation and trust boundaries?

Expected principle:

~~~text
_FINDIR_META != truth
_FINDIR_META = explicit semantic declaration
~~~

It must still be checked against workbook evidence.

## B. Generic parser contract

What generic contract should FinDir add so that Ivan Bani does not require a custom runtime adapter for every workbook revision?

Candidate name:

~~~text
SelfDescribingWorkbookProfileV1
~~~

## C. Canonical cash/object model

Can the current canonical model represent:

- contract cohort month;
- calendar cash month;
- object status;
- contract balance to receive;
- manager/product dimensions;
- shared costs;

without introducing Ivan-specific domain types?

## D. Profile lifecycle

How should an approved workbook contract progress:

~~~text
PROPOSED
→ VALIDATED
→ ACTIVE
→ SUSPENDED on drift
→ re-validation
~~~

What fingerprints / evidence invalidate it?

## E. Adaptive Owner Read Model

Can owner surfaces be client-configured from canonical metric IDs and filters rather than client-specific React code?

If gaps exist, define the smallest product extension.

## F. V1 owner UX

Architect should estimate and recommend:

1. deterministic MAX menu only;
2. MAX + simple configurable Mini App;
3. staged MAX first, Mini App second.

Recommendation must optimize for first owner value, not UI ambition.

---

# 20. Acceptance scenarios for the new workbook

The new model is not accepted on a pretty empty template.

## Scenario 1 — cross-month object

~~~text
Contract: May
Material payment: March
Material payment: April
Customer advance: May
Delivery: June
Final customer payment: July
Closed: July
~~~

Required:

- object remains on May sheet;
- May cohort report contains the object;
- March/April cash-out includes its materials;
- May cash-in includes advance;
- June cash-out includes delivery;
- July cash-in includes final payment;
- full object history reconciles.

## Scenario 2 — manager analysis

Two or more objects for one manager across different contract months.

Required: owner can query them together with no dependence on physical sheet location.

## Scenario 3 — product analysis

Same bath type across multiple months/managers.

Required: one deterministic product summary.

## Scenario 4 — closed but underpaid

Object marked **Закрыт**, but total receipts are below contract value.

Required:

- Data Quality warning;
- owner answer must not silently treat the object as fully paid.

## Scenario 5 — global cash reconciliation

For every calendar month:

~~~text
cash movement from all object sheets
+ shared cash movement
= canonical month cash movement
~~~

No double count.

## Scenario 6 — workbook drift

Rename a required category / break object block structure.

Required: profile cannot silently remain trusted.

## Scenario 7 — LLM boundary

Ask Qwen for a number not supported by canonical evidence.

Required: no invented numeric answer; explicit unsupported / needs clarification response.

---

# 21. Open business questions before workbook V1 is final

1. **Materials:** are purchases normally object-specific or stock/common-pool?
2. **Direct shop labor:** is it truly object-variable or partially fixed monthly payroll?
3. **Manager commission:** cash payment month vs calculated/accrued commission — which operational rule does Ivan want?
4. **Tax:** should owner object analytics show calculated 2% by object while cash view shows actual tax payment month?
5. **Shared-cost allocation:** does Ivan need object result after allocated company overhead, or is direct object result sufficient for daily use?
6. **Closure criteria:** what exactly must be true before economist marks an object **Закрыт**?
7. **Pre-contract materials:** if a March purchase is only allocated to a May object later, who performs and approves that allocation?

These must be answered by real operating practice.

---

# 22. Delivery sequence

## Stage 0 — architecture review

FinDir architect reviews this contract and issue #4.

No new client application is built.

## Stage 1 — clean Google Sheets V1

After architecture agreement:

- build the 12-sheet object structure;
- add grouping;
- add controlled statuses;
- add shared expenses;
- add references;
- add **_FINDIR_META**;
- add summary/control;
- preserve strict manual/formula visual distinction.

## Stage 2 — real operating pilot

Load 2–3 real objects that span multiple cash months.

Economist uses the workbook.

Capture friction and missing fields.

## Stage 3 — FinDir profile

Implement / validate the self-describing workbook profile contract.

Prove deterministic extraction and reconciliations.

## Stage 4 — owner delivery

Start with the smallest trusted owner experience:

- MAX deterministic menu;
- then free-form Qwen routing;
- Mini App only if justified and preferably through Adaptive Owner Read Model.

---

# 23. Definition of Done

- [ ] FinDir architect approves or amends the self-describing workbook contract.
- [ ] Monthly object-cohort semantics are unambiguous.
- [ ] Cash-period semantics are unambiguous.
- [ ] Material handling V1 is agreed with Ivan.
- [ ] Stable Object_ID is mandatory.
- [ ] Status / close logic is agreed.
- [ ] Shared-cost rules are agreed.
- [ ] **_FINDIR_META** schema is approved.
- [ ] Control / reconciliation rules are approved.
- [ ] No client-specific financial calculation fork is required in FinDir.
- [ ] Owner Read Model strategy is decided.
- [ ] A clean workbook V1 passes cross-month real-object acceptance.
- [ ] Only then do we decide whether a dedicated Mini App adds enough value.

---

# 24. Product owner position

The current direction is deliberately conservative:

> First make the business process and source data reliable.  
> Then let FinDir understand that source through an explicit contract.  
> Only after that optimize the owner interface.

Google Sheets is the operating backend for now.

FinDir is the intelligence, verification and owner-delivery layer.

A separate custom application for Ivan Bani is **not** the current product decision.
