# Lab ↔ Clinic Order Workflow and Patient-Facing UX in Dental Software (2023–2026)

Source labels: **[VENDOR]** = vendor marketing/docs (unverified); **[STUDY]** = peer-reviewed or systematic review; **[TRADE]** = trade-magazine survey (self-reported, non-peer-reviewed); **[PREPRINT]** = not peer reviewed.

## (A1) Which products define lab ↔ clinic case exchange, and how is a case/order modeled?

### Takeaway
The dominant pattern is a **shared case object with a status state machine**, visible in both a clinic and a lab inbox. Scanner ecosystems (Medit Link, 3Shape Communicate/Unite) provide the transport for scans, Rx and status. Vertically integrated labs (Dandy) and lab-management systems (LabStar) add chat, design approval, invoicing and payment. Medit's documented states (Pending → Accepted → Shipped → Case Completed, plus Rejected and Canceled, with the clinic confirming delivery) are the clearest public reference model.

### Cited Findings
**Medit Link (scanner-ecosystem order exchange, vendor docs)**
- The clinic opens a case, presses Order and fills an order form. The order sits in the clinic's "Order Box" as **Pending** until the partner lab accepts it, and the clinic can cancel it before acceptance. [VENDOR] — [Medit help: Order Box/In Box](https://support.medit.com/hc/en-us/articles/360025191211--Order-Box-In-Box); [Medit Link Workflow for Clinics](https://medit.com/meditlink-workflow-for-clinics)
- Order statuses: Pending, Accepted, Shipped, Case Completed, Rejected, Canceled. The status becomes "Shipped" when the lab marks the work done, the partner is notified, and tracking information is shared if the lab adds it. The clinic closes the loop with a **"Confirm Delivery"** button. [VENDOR] — [Medit Order Box/In Box (document360)](https://medit.document360.io/docs/order-boxin-box); [Medit Link Workflow for Labs](https://medit.com/meditlink-workflow-for-labs)
- Order status and production status are kept apart. The clinic "Case Box" has production filters (All / Form Only / Need Processing / Scan Completed / CAD / Ordered / Case Completed), and the lab "Work Box" has its own (… CAD / Done). Labs receive orders in an "In Box". [VENDOR] — [Medit Case Box/Work Box](https://medit.document360.io/docs/case-boxwork-box)
- Payment through Medit Link requires a contract with the lab, after the clinic has reviewed the lab's terms and price list. [VENDOR] — [Medit Order/Manage Orders](https://medit.document360.io/docs/ordermanage-orders)

**3Shape Communicate / Unite**
- 3Shape calls Communicate "the backbone of 3Shape's order exchange and communication services between clinics and labs," and says it will co-exist with Unite. [VENDOR] — [3Shape: Unite replace Communicate?](https://support.3shape.com/en_US/products-3shape-unite-3shape-communicate-how-to/unite-replace-communicate)
- Unite 23.1: the shade TRIOS measures during scanning is attached to the case automatically and sent to the lab, and it is visible in the Communicate portal and mobile app. This is a **structured, machine-captured shade field**, not free text. [VENDOR] — [What's New in Unite 23.1](https://support.3shape.com/en_US/3shape-unite-23-how-to/whats-new-in-unite-231)
- Unite Cloud (April 2024) is a web and mobile app for tracking case progress, attaching images and messaging the lab. A "Unite Store" lets users find new lab partners and review existing connections. [VENDOR] — [Get to know 3Shape Unite Cloud](https://support.3shape.com/get-started-with-unite-241/knowing-the-new-unite-cloud-solution)
- Labs or clinics without 3Shape software can view 3Shape design files in a free Communicate app or a web viewer. [VENDOR] — [3Shape Communicate](https://www.3shape.com/services/communicate)

**Dandy (vertically integrated digital lab)**
- In the Dandy portal and mobile app, dentists track cases, **chat with the lab team**, review and **approve digital wax-ups / 3D designs**, and add patient photos. Case statuses and delivery dates are shown in one place. [VENDOR] — [Dandy portal & mobile app](https://www.meetdandy.com/technology/portal-and-mobile-app/); [Dandy one connected system](https://www.meetdandy.com/technology/one-connected-system/)
- Dandy offers free remakes and a 10-year warranty on fixed restorations, and its help center has a "Submit a Refabrication in the Doctor Portal" flow, so remakes are a first-class action. [VENDOR] — [meetdandy.com](https://www.meetdandy.com); [Dandy Help: Case Management](https://help.meetdandy.com/hc/en-us/sections/19263420320909-Case-Management)
- August 2025: Dandy launched "Dandy Hub" and "Dandy Insights", a centralized lab-work control portal for DSOs and multi-location groups. [VENDOR press release] — [StreetInsider press release](https://www.streetinsider.com/Press+Releases/Dandy+Hub+and+Dandy+Insights+Help+DSOs+Grow+Revenue%2C+Scale+Smarter/25147946.html)

**LabStar (lab-side management, cloud)**
- LabStar's client portal lets doctors open online Rxs, print invoices and statements, **pay by credit card** and track shipments. Its production dashboard shows each case's status with real-time task tracking. [VENDOR/trade article] — [DentistryIQ: cloud-based lab software](https://www.dentistryiq.com/dentistry/prosthodontics-and-laboratory/article/16359622/dentists-can-expect-good-things-from-cloud-based-dental-lab-software)
- The CEO claims LabStar is the only cloud lab software where dentists pay invoices directly in the portal. [VENDOR self-claim] — [Dental Products Report: Taking the dental lab to the cloud](https://www.dentalproductsreport.com/taking-dental-lab-cloud)
- Product scope runs from case entry to invoice: clients, sales, logistics, digital files, reporting, billing. Online Rx, case scheduling, shipping, secure doctor messaging and CRM date from the 2015 v2.0 release. [VENDOR] — [SourceForge LabStar listing](https://sourceforge.net/software/product/LabStar/); [Aegis 2015 announcement](https://aegisdentalnetwork.com/news/2015/09/18/labstar-announces-software-upgrade)

**Russia/CIS**
- AverSoft "ЗТЛ" (Yekaterinburg) is lab-specific software covering the work journal, consumption of materials, deadline control, and an iPad client for technicians. No clinic-CRM integration is described. [VENDOR catalog] — [a2is.ru AverSoft](https://a2is.ru/catalog/programmy-upravleniya-stomatologiyey/aversoft); [App Store: ЗТЛ клиент](https://apps.apple.com/ge/app/%D0%B7%D1%82%D0%BB-%D0%BA%D0%BB%D0%B8%D0%B5%D0%BD%D1%82-%D0%B4%D0%BB%D1%8F-%D1%81%D0%B5%D1%82%D0%B5%D0%B2%D0%BE%D0%B9-%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D0%B8/id1536398388)
- Generic work-management tools (Planfix) sell a "dental lab clinic orders" configuration built from boards, fields and reports. This suggests the CIS market often handles lab orders with generic tools rather than a dedicated clinic↔lab network. [VENDOR] — [Planfix: Track Dental Lab Orders](https://planfix.com/industry-solutions/dental-lab-clinic-orders/)
- 1С:Стоматологическая клиника lists treatment, sales, purchasing, warehouse, finance, payroll and CRM, with no separate lab module in its description. [VENDOR] — [1C solution PDF](https://solutions.1c.ru/upload/reestr/40a/9kqgxsefn9qkcv6nnizozo3vjwyfj1rn/Stomatologicheskaya-klinika_opisanie.pdf)

### Inferences
- Reference model for a clinic-side lab-order feature: **Rx form → order with explicit lab acceptance → production status (lab-owned) separate from order/delivery status → clinic "confirm delivery" → remake as a linked child order**. Medit and Dandy both point to this.
- Structured shade capture (3Shape auto-attach) and design-approval steps (Dandy wax-up approval) answer the two biggest remake causes below: shade and fit.
- The lab-side commercial layer (price list, contract, invoice, online payment) sits with the lab system (LabStar, Medit contract). A clinic product mostly needs order cost and payable tracking, not full lab invoicing.
- In CIS, no dominant clinic↔lab network appeared in my searches. That leaves an open niche, but it also means clinics are used to phone and messenger exchange.

### Gaps
- No public field-level spec of an Rx form (tooth, shade, material, due date fields) for Dandy, Glidewell, Evident or DLCPM was retrieved. Glidewell's online case management, exocad DentalShare, Straumann/Sirona Connect, Labtrac and DLCPM were **not researched** (tool budget).
- IDENT (Russia): searches found **no evidence** of a lab work-order (заказ-наряд) module. Check with the vendor directly.
- Technician assignment and multi-clinic lab dashboards are documented only at the "production dashboard" level (LabStar). I found no UX detail.

## (A2) What pain points do clinics and labs report?

### Takeaway
Peer-reviewed evidence shows **incomplete or non-compliant Rxs, with shade and due date the items most often missing**. Fit (margin, proximal) and shade are the leading remake causes. In a 2026 audit of 40k restorations, communication was still ~93% paper among remakes. Trade surveys attribute most remakes to the dentist side, but those are lab self-reports.

### Cited Findings
- UK survey (BDJ 2014, n=248, 32% response): the lab prescription and the **telephone** were the main communication tools, and the items most often missing from prescriptions were **shade and date required**. [STUDY] — [British Dental Journal 2014](https://www.nature.com/articles/sj.bdj.2014.832.pdf)
- UK NHS teaching-hospital audit (BDJ 2011): a "high proportion" of prescriptions received by technicians were non-compliant. [STUDY] — [British Dental Journal 2011](https://www.nature.com/articles/sj.bdj.2011.623.pdf)
- Riyadh multicenter audit (Saudi Dental Journal, 2026), 7 labs, July 2022–July 2023, **40,344 restorations, 2,612 remakes**:
  - Remake rate **6.5%** (95% CI 6.2–6.8). By type: veneers 7.5%, crowns 6.9%, bridges 4.8%.
  - Causes: margin fit 29.5%, proximal fit 23.2%, improper fit 22.7%, **shade mismatch 16.3%**, esthetics 15.5%.
  - Communication among remakes was **92.9% paper / 7.1% digital**. Digital-vs-paper remake rates could not be computed because denominators were missing.
  - Remake rate by operator: students 28.8%, general dentists 10.3%, specialists 2.7%.
  - [STUDY] — [PMC12901796](https://pmc.ncbi.nlm.nih.gov/articles/PMC12901796/)
- LMT 2024 Remake Survey: labs say **>80% of external remakes are due to dentist error**, mainly inadequate impressions and incorrect shades. The figure has been stable since the 2011 and 2018 surveys, and almost half of labs track remake percentage by client. [TRADE, lab self-report] — [LMT: Productivity Disrupter: Remakes](https://lmtmag.com/articles/survey-report-productivity-disrupter-remakes); 2023 version says 82% — [LMT: Getting Tough on Remakes](https://lmtmag.com/articles/getting-tough-on-remakes)
- Dandy survey (Q3 2025, 137 US dentists): **94%** had ordered a remake, **23%** had remade a prosthetic 3+ times, and **51%** spend >1 hour/week dealing with remakes. [VENDOR survey] — [Dandy newsroom](https://www.meetdandy.com/newsroom/survey-poor-fitting-prosthetics/)
- A Spear Education article cites a 2020 paper saying 85% of lab prescriptions do not meet legal criteria. I could not verify the original. [Secondary] — [Spear: Top 5 Pet Peeves of Labs and Dentists](https://www.speareducation.com/2021/02/top-5-pet-peeves-of-labs-and-dentists-part-1)

### Inferences
- **Make shade and due date required fields** on the lab-order form. They are the documented most-omitted items.
- Add photo attachments (shade-tab photo) and a structured remake reason code (fit-margin / fit-proximal / shade / esthetic / other), mirroring the audit's taxonomy. This allows per-lab and per-doctor remake analytics; labs already track remakes per client.
- The audit's paper-dominance (93%) and the BDJ phone-reliance suggest that in comparable markets (likely including Uzbekistan) the competitor is paper plus messengers, not another platform.

### Gaps
- I found no quantified data on "lost Rx", WhatsApp/phone chaos or due-date-miss rates. These are widely asserted but not measured in the sources found.
- I found no study comparing remake rates for digital vs analog submissions (the Riyadh audit explicitly could not).

## (B1) Evidence that reminders reduce no-shows; channel and timing effects

### Takeaway
Reminders reliably improve attendance, but the effect is **modest**: pooled RR ≈ 1.1–1.15 in attendance terms, or roughly a +10-percentage-point attendance gain in older Cochrane data. SMS and phone perform similarly. A **single reminder ~24h before** may capture most of the benefit (large preprint). WhatsApp-specific RCT evidence is thin and mixed.

### Cited Findings
- Al-Turbag et al., systematic review and meta-analysis (J Hosp Manag Health Policy, published March 2026; search to Oct 2023), 12 studies, 10 pooled (n=8,236):
  - Overall attendance **RR 1.11 (1.05–1.19)**, I²=83%.
  - Telephone **RR 1.11 (1.04–1.19)**, significant.
  - SMS **RR 1.14 (0.99–1.31), P=0.07**, not significant, I²=91%.
  - Timing was barely studied.
  - Caveat: the paper's own conclusions call SMS effective despite the CI including 1.
  - [STUDY] — [JHMHP 2026](https://jhmhp.amegroups.org/article/view/10215/html)
- An earlier SMS meta-analysis (2005–2015 studies) pooled RCTs at **OR 1.62 (1.35–1.94)**, and found timing, frequency and content did not significantly change the effect. [STUDY] — [Boksmati et al., Semantic Scholar](https://www.semanticscholar.org/paper/The-Effectiveness-of-SMS-Reminders-on-Appointment-a-Boksmati-Butler-Henderson/40938778cdbbb143b6b77da0f2666646240f7b4d)
- Cochrane review, mobile phone messaging reminders (2013):
  - Attendance was **67.8% with no reminder, 78.6% with messaging, 80.3% with phone calls**, so messaging ≈ phone at lower cost.
  - A secondhand summary also reports text vs none at RR 1.14 (1.03–1.26) across 7 trials (n=5,841).
  - I could not open the full text (403), so these figures come via search summaries. [STUDY, secondhand] — [Cochrane CD007458.pub3](https://cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007458.pub3)
- A realist review found **no differential effectiveness between reminder technologies**. [STUDY] — [Dovepress PPA: "Appointment reminder systems are effective but not optimal"](https://www.dovepress.com/appointment-reminder-systems-are-effective-but-not-optimal-results-of--peer-reviewed-fulltext-article-PPA)
- WhatsApp timing (Buenos Aires public system, 2023–2024, **475,214** outpatient appointments):
  - A **single WhatsApp reminder ~24h ahead** reduced no-shows the most.
  - Adding a 72h reminder did **not** improve attendance, but it **increased advance cancellations**. That is useful for refilling slots.
  - [PREPRINT, medRxiv; via search summary] — [PMC11382525](https://pmc.ncbi.nlm.nih.gov/articles/PMC11382525)
- A 2024 RCT in Punjab, India (hypertension follow-up, enhanced reminder messages) found no significant attendance gain (21.8% vs 19.6%, figures via secondary summary). [STUDY, via summary] — [BMC Public Health, Sep 2024 (DOAJ)](https://doaj.org/article/4defefcfa4c549379d0059897bc2955a)
- A vendor-cited "38% no-show reduction" from WhatsApp in UK dental practices has **no traceable source**. Do not use it. — [codewords.ai blog](https://codewords.ai/blog/how-to-reduce-no-shows-at-your-dental-practice-with-whatsapp-reminders)

### Inferences
- Design default: **one reminder ~24h before, plus an optional earlier (48–72h) message whose main purpose is two-way confirm/cancel**. The earlier message's value is releasing slots early, not attendance itself.
- The channel matters less than delivery. Telegram (the project's channel) should be fine as long as it reaches the patient, with SMS as the fallback. This matches the existing Telegram > Eskiz > NoOp priority.
- Set realistic expectations in product messaging: reminders are a ~10% relative attendance improvement, not "cut no-shows in half".

### Gaps
- I found no peer-reviewed **dental-specific** 2023–2026 trial of two-way confirmation or waitlist auto-fill. Evidence on these is vendor and operational only.
- No head-to-head WhatsApp/Telegram vs SMS RCT was found. I found no Telegram reminder study at all.
- Baseline dental no-show rates vary widely in vendor blogs (≈7% to 15%). A Planet DDS "6.9% (2025) vs 7.4% (2024)" figure appeared in search snippets, but I did not retrieve the primary report, so it is unverified.

## (B2) Online booking, waitlist, deposits, intake, e-consent, portals: design patterns and vendor evidence

### Takeaway
Vendors push **24/7 self-booking against real PMS availability**, but their headline numbers are inconsistent: NexHealth says both 73% and 43% of bookings are after hours. Digital intake is sold on front-desk time savings with a **hybrid model**: pre-visit link, tablet fallback in the lobby, paper fallback for elderly patients. Almost all numbers here are vendor-sourced.

### Cited Findings
- NexHealth feature pages: "73% of patient appointments are booked after hours". [VENDOR] — [NexHealth Scheduling](https://www.nexhealth.com/features/scheduling)
- Another NexHealth page says "43% of bookings made after hours", repeated by partner Delmain. This is an **internal inconsistency**, and no methodology is given. [VENDOR] — [NexHealth Online Payments](https://www.nexhealth.com/features/online-payments); [Delmain/NexHealth](https://delmain.co/nexhealth/)
- NexHealth case studies (vendor-selected): Grand Street Dental "+157% online bookings", Camelback Dentistry "+72% new patients" after consolidating 4 systems. [VENDOR] — [Grand Street case study](https://www.casestudies.com/company/nexhealth/case-study/nexhealth-helps-grand-street-dental-increase-online-bookings-by-157); [Camelback](https://www.nexhealth.com/resources/camelback)
- Digital intake claims:
  - Zentake case study: 15 h/week saved in a small practice. [VENDOR] — [Zentake](https://www.zentake.com/blog-post/how-a-small-dental-practice-saved-15-hours-a-week-with-dental-digital-intake-forms)
  - Other claims: intake time down 65% (18 → 6.3 min), and an "ADA HPI 2024" figure of a 31% cut in front-desk onboarding time with 68% of practices still partly on paper. These survey attributions are **unverified**. [VENDOR] — [RaftLabs blog](https://www.raftlabs.com/blog/digital-patient-intake-dental-practices); [US Tech Automations](https://ustechautomations.com/resources/blog/automate-stop-paper-intake-forms-in-dental-2026)
- Recommended hybrid: forms completed before the visit, a lobby tablet for walk-ins who haven't filled them, paper backup acceptable for elderly patients. [VENDOR guidance] — [Jotform: digital intake for dental](https://www.jotform.com/blog/digital-patient-intake-for-dental-practices/); [RevenueWell: simplify intake forms](https://www.revenuewell.com/article/how-can-small-dental-practices-simplify-patient-intake-forms)
- Waitlist: operational advice is to run an automated waitlist, reserve 10–15% capacity for same-day needs, and track "same-day fill rate" (the share of cancelled slots refilled from the waitlist). I found no outcome data. [VENDOR/agency] — [hip.agency: Reducing dental no-shows](https://hip.agency/?p=25039)

### Inferences
- Treat booking-UX metrics as hypotheses to instrument, not facts: after-hours booking share, waitlist fill rate, confirmation rate. For a clinic in Uzbekistan, "after hours" behavior likely shows up in **Telegram**, not on a web widget.
- Intake and e-consent should be **pre-visit link (Telegram/SMS) → tablet fallback → paper fallback**, with patient-entered data reviewed by staff before it is committed to the medical record.

### Gaps
- No independent study (non-vendor) on online-booking conversion, deposits or patient-portal adoption in dentistry 2023–2026 was retrieved. Weave, Solutionreach and RevenueWell annual reports were not accessed.
- I found no data on deposit/no-show-fee effects in dentistry.

## (B3) Messenger/chatbot booking in emerging markets (WhatsApp, Telegram; Uzbekistan)

### Takeaway
In Uzbekistan, **Telegram is already a booking channel** for medical aggregators. Med24.uz takes requests via phone or Telegram bot, and the Sino AI startup offers a uz/ru Telegram bot with booking. National apps (DMED, ZorDoc) also offer online booking. I found no adoption or outcome data.

### Cited Findings
- Med24.uz takes appointments "by phone or via our Telegram bot". Booking is free, and the visit is paid at the clinic. [VENDOR] — [med24.uz FAQ](https://med24.uz/faq)
- Sino AI (2025, marked as advertorial) is a Telegram bot with symptom triage, test interpretation, a doctor catalog and online booking, in Uzbek and Russian. [VENDOR/advertorial] — [Spot.uz 2025](https://www.spot.uz/ru/2025/09/15/sino-ai/)
- The Uzbekistan Ministry of Health runs an official Telegram bot, for anti-corruption complaints rather than booking. This indicates Telegram is a normalized citizen–health-system channel. [NEWS] — [Daryo 2023](https://daryo.uz/en/2023/01/12/ministry-of-health-of-uzbekistan-introduces-new-telegram-bot-to-combat-corruption/)
- DMED and ZorDoc are app-based (not bot-based) booking platforms in Uzbekistan. [App store] — [DMED.uz](https://apps.apple.com/pl/app/dmed-uz/id6468250285); [ZorDoc](https://apps.apple.com/app/zordoc/id1596740567)
- Russian-language bot builders (BotHelp) ship ready "dentistry" and "online registry in messenger" templates covering doctor selection, slot booking and reminders. [VENDOR] — [BotHelp dentistry template](https://bothelp.io/ru/templates/stomatologiya); [BotHelp online registry](https://bothelp.io/ru/templates/onlajn-registratura)

### Inferences
- For this product, the **in-process per-tenant Telegram bot is the natural patient-facing surface** for booking, confirm/cancel, intake links and reminders. A separate patient portal or app likely has lower adoption value in this market.
- Aggregators (Med24, DMED) compete for the booking entry point. A clinic-owned bot that knows real slots is a differentiator over "leave a request" aggregator flows.

### Gaps
- I found no statistics on Telegram penetration among Uzbek clinic patients, and no bot-booking conversion or no-show outcome data for CIS/Central Asia.
- No WhatsApp Business adoption data for dental in emerging markets was retrieved. Brazil and Mexico WhatsApp RCTs were mentioned only in blogs and not verified.
