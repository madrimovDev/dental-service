# UI/UX design trends in dental & clinic PMS (2024–2026), from vendors' own design choices

> Research date: 2026-11-11. About 22 search/fetch calls. Most sources are **vendor-owned** (press releases, help centers, product pages), so claims about outcomes such as "99% accuracy" or "50% less charting" are **vendor marketing** unless stated otherwise. Help-center and manual pages describe shipped behavior and are the most reliable evidence of actual UI. Undated help pages may describe behavior that predates 2024; this is flagged inline.

## Scheduling / calendar (appointment book)

### Takeaway
Leading products still converge on a **vertical time axis with one column per chair/operatory** (provider shown inside the appointment or as a time bar). Status is shown as a **small icon or letter cycled on the appointment card**, plus a separate **virtual waiting room** with wait-time color coding. Side "lists" (ASAP/short-notice, unscheduled, recall) and a "pinboard/clipboard" for drag-and-drop rescheduling are standard. The 2024–2026 change is **not** a new calendar layout: it is **automation on top of it**, with AI "smart fill" of openings, confirmation and recall agents that write to the schedule, and two-way sync with personal calendars.

### Cited Findings
**Open Dental** (manual, undated; describes current shipped UI, likely pre-2024 in origin)
- Day view shows **one column per operatory**; week view shows one column per day. The operatory header shows the default provider, specialty, scheduled providers and notes. — [Open Dental Manual: Appointments Module](https://opendental.com/manual/appointments.html)
- Vertical time axis with a horizontal **current-time line**. Vertical **time bars** show appointment length and provider time. White means open time and grey means closed time (driven by Schedule Setup). Completed appointments are grey by default. Broken appointments are crossed out. Colors are customizable in Definitions: Appointment Colors. — [Open Dental Manual: Appointments](https://opendental.com/manual/appointments.html); [Appointment Colors](https://opendental.com/manual/definitionsappointmentcolors.html)
- The left panel holds a mini calendar, a Day/Week toggle, **Daily Production vs Daily Goal** totals, confirmation-status buttons, and tabs for **Waiting Room**, Employees, Providers and Reminders. — [Open Dental Manual](https://opendental.com/manual/appointments.html)
- **Pinboard:** a holding area where appointments are dragged to move them across dates. New appointments and recalls land there automatically. Drag-and-drop works to another time, day, operatory or the Pinboard. A move can prompt for a provider change or a resize. — [Open Dental Manual](https://opendental.com/manual/appointments.html)
- Lists: **Unscheduled List**, **ASAP List** (patients who want an earlier opening; you can "Text ASAP List" on an empty slot), and Recall. Blockouts are added by right-clicking open time. **Appointment Views** control which operatories and providers are visible and which fields appear on the card, and can be switched by dropdown or function key. — [Open Dental Manual](https://opendental.com/manual/appointments.html); [Appointment View Edit](https://opendental.com/manual/appointmentvieweditwindow.html)

**Dentally** (Henry Schein One, UK; help center, undated)
- The status workflow is shown as a **small icon in the top-right of each appointment**: Pending (P) → Confirmed (C) → Arrived (clock) → In Surgery/Seated (S) → Completed (tick). Click the icon to advance it, or right-click and pick the next step. — [Dentally Help: appointment statuses](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means)
- Marking **Arrived** notifies the practitioner, moves the patient to a **virtual Waiting Room**, and starts a wait timer. Waiting Room color: **green** = arrived early, **orange** = under 5 minutes late, **red** = more than 5 minutes late. **In Surgery** is set automatically when the practitioner opens the patient record in surgery. — [Dentally Help: Waiting Room](https://help.dentally.com/en/articles/3548877-waiting-room)
- **Completed** triggers charging of fees and creation of the estimate, consent form and follow-up appointment, so the status change itself is a workflow trigger. — [Dentally Help](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means)

**Cliniko** (general allied-health PMS; help center, undated)
- Status is shown as **pictogram symbols** on the appointment: a person in a **blue shirt** = arrived, a **red shirt** = did not arrive. By default no symbol is shown; symbols appear only after an action. — [Cliniko Help: symbols on appointments](https://help.cliniko.com/en/articles/1023901-a-guide-to-the-symbols-on-appointments)

**Exact / Software of Excellence** (UK)
- Appointment-book **column colours and appearance are configurable per column** (help-center article exists; contents not fetched). — [SOE Help: Configuring Appointment Book Column Colours](https://help.softwareofexcellence.com/hc/en-gb/articles/360061369472)

**Curve Dental** (2025)
- 2025 enhancement: **Smart Fill** refinements help teams reach short-notice patients, prioritize high-value treatments, and fill openings by CDT code, treatment type and status. In other words, ASAP-list matching is now ranked by value. — [Curve blog: Top Six Enhancements of 2025](https://curvedental.com/blog/thankful-for-curve-users)
- Curve GRO (Aug 2024): automated reminder campaigns that **update the schedule when the patient confirms**. — [Dental Products Report](https://dentalproductsreport.com/view/curve-dental-s-new-curve-gro-advances-patient-engagement)

**Jane App** (Nov 2025)
- **Google Calendar Sync**: practitioners see their personal calendar alongside the Jane schedule. — [Jane press release, 19 Nov 2025](https://tools.prnewswire.com/en-us/live/20823/release/20251119EN27859)

**Planet DDS DentalOS** (Jul 2026)
- "Agents+": a **Confirmation Agent** that "automatically confirms appointments and updates the schedule" and a **Recall Agent** that books overdue patients are live. **Cancellation Recovery** and **Missed Appointment Recovery** agents are "coming soon". — [Planet DDS: DentalOS launch, 17 Jul 2026](https://www.planetdds.com/newsroom/dentalos-enterprise-platform/)

### Inferences
- The chair-column, vertical-time grid is a stable convention, with provider identity layered on as color or a time bar. A clinic product should not reinvent it.
- The status lifecycle (booked → confirmed → arrived → seated → completed, plus no-show/broken) is shown with **compact icons on the card plus a separate waiting-room list with lateness colors**. Status transitions are increasingly used as **workflow triggers** (charging, follow-ups).
- 2024–2026 innovation is in **filling gaps automatically** (value-ranked smart fill, agents writing confirmations and rebookings) rather than in calendar visuals.

### Gaps
- I did not fetch scheduler UI documentation for Dentrix Ascend, Curve (column model), tab32, Denticon or CareStack, so I cannot confirm whether they use provider-column or operatory-column defaults, or how they handle block scheduling.
- I found no 2024–2026 source describing a redesigned appointment-book layout from any vendor.
- Online-booking slot rules (which slots are exposed and how) were not found in vendor docs.

## Clinical charting / odontogram / perio / imaging / case acceptance

### Takeaway
The biggest 2024–2026 shift in clinical UX is **voice**. Voice perio charting (Bola AI, integrated into most major US PMSs; native in Denticon and Dentrix Ascend) and **ambient AI clinical notes** (Dentrix Ascend Voice Notes, VideaHealth, CareStack + Heidi) now let clinicians chart without touching a keyboard. Imaging AI (Pearl, Overjet, Videa) surfaces as **color-coded overlays** on radiographs, used both chairside for patient explanation and in the PMS for detection.

### Cited Findings
- **Dentrix Ascend Next Generation Clinical Workflow (30 Apr 2026, "available now")**: **Voice Notes** (ambient chairside conversation → structured clinical notes), **Voice Perio** (chart perio by voice "without leaving the patient"), **Image Verify** (real-time radiograph quality review), and **Detect AI** (surfaces Videa AI findings as a detection aid; "clinicians make the final call"). — [Henry Schein One press release](https://www.henryscheinone.com/about-us/press-release/dentrix-ascend-introduces-next-generation-clinical-workflow-built-with-aws/)
- Same release, **vision only (undated)**: AI image magnification, **disease-progression heat maps over time**, real-time voice charting to structured chart entries, **voice commands for hands-free navigation**, and **AI treatment-planning coaching for case acceptance**. — [Henry Schein One](https://www.henryscheinone.com/about-us/press-release/dentrix-ascend-introduces-next-generation-clinical-workflow-built-with-aws/)
- Voice Notes was first unveiled at GNYDM in Nov 2025. Ascend's learning site gives a release date of 4/1/26. **Standard** recordings are capped at **5 minutes**; **Voice Notes Ambient** has no limit and is included with Ascend Accelerate. Essentials and Pro get post-exam dictation. — [HS1 GNYDM 2025 release](https://www.henryscheinone.com/about-us/press-release/henry-schein-one-unveils-industry-first-natively-embedded-voice-workflow-at-2025-greater-new-york-dental-meeting/); [Dentrix Ascend Learn: Voice Notes](https://learn.dentrixascend.com/dentrix-ascend-voice-notes/)
- **VideaHealth Voice Notes** (Oct 2025) was marketed as "the first ambient AI scribe purpose-built for dentistry". This conflicts with HS1's "industry-first natively embedded" claim; both are marketing. — [BusinessWire, Oct 2025](https://secure.businesswire.com/news/home/20251029535866/en/VideaHealth-Launches-Voice-Notes-the-First-Ambient-AI-Scribe-Purpose-Built-for-Dentistry)
- **CareStack**: AI voice notes that transcribe and update chart notes in real time (vendor claims up to 99% accuracy). A separate **AI Scribe powered by Heidi** is launched **from the patient chart** to record a visit and insert the note. — [CareStack: integrated voice-assisted notes](https://carestack.com/en-GB/dental-software/features/integrated-voice-assisted-notes); [CareStack AU help: AI Scribe](https://carestack-aus.zendesk.com/hc/en-au/articles/23603596635666-AI-Scribe-Streamlining-Clinical-Note-Taking)
- **Bola AI Voice Perio** captures probing depths, gingival margin/recession, bleeding, suppuration, mobility and furcation. It integrates with Dentrix, Dentrix Ascend, Eaglesoft, Open Dental (announced 10 Oct 2024), Curve and Fuse. Vendor claims: 99% accuracy and 18.5 minutes saved per hygienist per day (Heartland Dental case study). — [Bola: Voice Perio](https://bola.ai/solutions/voice-perio/); [Bola + Open Dental](https://bola.ai/news/bola-ai-announces-voice-perio-integration-with-open-dental/); [Becker's Dental](https://www.beckersdental.com/ai-teledentistry/open-dental-adds-bola-voice-ai-to-its-software)
- **Planet DDS** lists **AI Voice: Perio Charting** within Denticon as completed. — [Planet DDS AI Assist](https://www.planetdds.com/?p=14183)
- **Curve+ AI clinical workflows (2025)**: ambient clinical voice capture is "still in development". — [Curve blog](https://curvedental.com/blog/thankful-for-curve-users)
- **Jane AI Scribe** (broad launch Nov 2025): records sessions or uploads, transcribes them, and produces SOAP or custom-format notes. **AI Scribe Free** gives 5 notes per month. Jane claims up to 50% less charting time (based on Jul–Dec 2025 data). Telehealth support was added in May 2026. — [Jane: AI Scribe](https://jane.app/features/charting-ai-scribe); [Jane press release Nov 2025](https://tools.prnewswire.com/en-us/live/20823/release/20251119EN27859); [Jane blog: telehealth](https://jane.app/blog/you-can-now-use-jane-s-ai-scribe-for-your-telehealth-sessions)
- **Imaging AI**: Pearl Second Opinion got FDA clearance for 2D+3D in 2025 and panoramic findings in Dec 2025. Patient-facing features include **color-coded annotations and printable visuals for chairside explanation**. Second Opinion 3D (CBCT) launched commercially on 3 Sep 2026. — [Pearl newsroom](https://hellopearl.com/news/pearl-launches-second-opinion-3d-bringing-fda-cleared-3d-imaging-ai-to-general-dentists-for-the-first-time); [Pearl vs Overjet (Pearl-authored, biased)](https://hellopearl.com/blog/pearl-vs-overjet-which-is-best-for-your-practice-pearl)
- **tab32** integrated Pearl detection in Jun 2024. Cloud imaging is included in every plan; Pearl is a paid add-on. — [BusinessWire, 25 Jun 2024](https://www.businesswire.com/news/home/20240625675898/en); [tab32 about](https://tab32.com/about/)

### Inferences
- Voice is becoming the primary input for **perio** (structured, numeric, hands-busy) and for **narrative notes** (ambient). The UI pattern is "record from the patient chart → AI draft → clinician review/insert", with tiered limits (short dictation vs unlimited ambient).
- Imaging AI is presented as an **overlay plus a "clinician decides" framing**, and doubles as a **case-acceptance visual**.
- Case-acceptance AI (treatment-plan coaching) is still at the announcement stage.

### Gaps
- I found no 2024–2026 source detailing odontogram graphic styles (anatomical vs geometric, FDI vs Universal toggles) for any vendor. Not researched in depth.
- Treatment-plan presentation UIs (patient-facing plan pages, e-signature) were not found in fetched sources.
- The Overjet chairside patient-view launch is unconfirmed.

## Patient record layout (header / alerts / tabs / timeline)

### Takeaway
I found **no reliable 2024–2026 vendor source** describing the patient header, alerts, or tabs-vs-single-page layout. The only adjacent findings are AI intake that fills the record from photos, and a waiting-room flow that opens the record directly.

### Cited Findings
- **Dentrix Ascend Digital Forms** use AI to capture insurance data from photos of a driver's license, insurance card and credit card. — [HS1: Next Era of Dentrix Ascend, Mar 2026](https://www.businesswire.com/news/home/20260309270533/en/)
- In Dentally, clicking a patient's name in the Waiting Room opens the record and sets them In Surgery. — [Dentally Help: Waiting Room](https://help.dentally.com/en/articles/3548877-waiting-room)

### Inferences
- None that can be cited. A patient banner with medical alerts and balance is a common PMS convention, but this research did not verify it.

### Gaps
- Patient header and alert design (allergy and medical-alert badges, balance display) for Dentrix Ascend, Curve, Dentally and the others. A dedicated help-center search is needed.

## Front-desk dashboards (morning huddle, goals, lists)

### Takeaway
Morning-huddle dashboards (production vs goal, scheduled vs unscheduled treatment) are an established pattern (Denticon 2023; Open Dental shows a daily production/goal on the schedule panel). The 2026 direction is **natural-language querying of practice data** (Dentrix Ascend "Ask") and **role- or persona-driven experiences** (DentalOS).

### Cited Findings
- **Denticon Morning Huddle Dashboard** (2023): a high-level overview of production goals with multiple dashboards and filters. It is part of a bundle with Production Analysis, Collections Analysis and Provider Breakdown. — [Planet DDS resource](https://planetdds.com/resource-library/morning-huddle-dashboard-within-denticon-start-your-day-with-insights); [Flyer 2023 (PDF)](https://www.planetdds.com/wp-content/uploads/2023/06/Flyer-Denticon-Morning-Huddle-050923.pdf)
- Open Dental shows **Daily Prod vs Daily Goal** directly in the appointment module's side panel. — [Open Dental Manual](https://opendental.com/manual/appointments.html)
- **Dentrix Ascend "Ask"** (28 Apr 2026, preview): any team member can query clinical, operational and financial data in plain language, for example "Who has unverified insurance this week?" Ascend has also opened its **MCP layer**, with a future build layer for custom workflows, dashboards and agents. The release does not describe the UI. — [HS1: Dentrix Ascend opens MCP layer](https://www.henryscheinone.com/about-us/press-release/dentrix-ascend-opens-mcp-layer/)
- **DentalOS** (Jul 2026): a "persona-driven" roadmap with each phase "designed to solve for a distinct role inside the DSO", "a unified OS desktop experience", and a goal of "eliminating workflow friction and login fragmentation". — [Planet DDS](https://www.planetdds.com/newsroom/dentalos-enterprise-platform/)

### Inferences
- Huddle KPIs are moving from static dashboards toward **query-on-demand** (chat or Ask) and **agent-maintained worklists** (recall gaps, unverified insurance).

### Gaps
- Task-list and unscheduled-treatment list UIs for Curve, CareStack and Dentally were not found.

## Billing / checkout / payments / insurance

### Takeaway
2025–2026 releases focus on **embedded payments and AI insurance verification** (US-specific) rather than ledger redesign.

### Cited Findings
- **Curve Pay** (29 Sep 2025): payments built in, with next-day payouts, Buy Now Pay Later, and automated reconciliation. Canada rollout is planned for 2026. **Eligibility+** (2025) is AI verification that pulls code-level benefits from payer portals, flags discrepancies, and offers **one-click record update**. **Membership plans** (via DentalHQ) are expected in early 2026. — [Curve blog](https://curvedental.com/blog/thankful-for-curve-users); [Curve Pay release](https://www.finanzen.net/nachricht/aktien/the-future-of-dental-payments-starts-now-curve-dental-launches-curve-pay-14920265)
- **Dentrix Ascend Eligibility Pro** is live and verifies insurance automatically; it expands to all Ascend DSOs in Q4 2026. Live agents include claims reconciliation, recall gap management and automated follow-up. — [HS1 MCP release](https://www.henryscheinone.com/about-us/press-release/dentrix-ascend-opens-mcp-layer/); [HS1 Mar 2026](https://www.businesswire.com/news/home/20260309270533/en/)
- **tab32** (Alpine for practices and Summit for DSOs, 2025) lists AI eligibility verification, AI claims automation and **AI payment posting** in production (vendor claim). — [tab32 about](https://tab32.com/about/)
- Dentally's "Completed" status auto-charges fees. — [Dentally Help](https://help.dentally.com/en/articles/6709513-what-a-patient-s-appointment-status-means)

### Inferences
- For a non-US (e.g. Uzbekistan) clinic product, the insurance-AI wave is mostly irrelevant. The transferable patterns are **status-triggered charging**, **embedded payments with auto-reconciliation**, and **membership plans**.

### Gaps
- Ledger and checkout screen layouts were not found.

## Mobile / tablet, dark mode, accessibility, keyboard shortcuts

### Takeaway
Dark mode is **rare** in dental PMS. Only one minor vendor lists it as shipped, Dentally is still gauging demand, and a veterinary PMS claimed "first PMS with dark mode" in 2025. Patient-facing mobile apps are growing (Jane, Nov 2025). Keyboard navigation exists in legacy desktop products (Open Dental function-key views).

### Cited Findings
- **Dentally**: a July 2025 community post "gauging if we can get a Dark Mode UI". Staff asked whether users want a manual toggle or automatic night switching, so it is not shipped. Dentally also introduced a new colour palette (blog, undated). — [Dentally community](https://community.dentally.com/dentally-vision-43/dark-mode-graphics-347); [Dentally blog: new colour palette](https://blog.dentally.com/en-gb/say-hello-to-our-new-colour-palette)
- **MyDentalPMS v2.2.0** (Dec 2025) lists "Dark Mode support across all modules". This is a low-credibility source (pages.dev). — [MyDentalPMS help](https://mydentalpms-site.pages.dev/help)
- **Shepherd** (veterinary) launched dark mode in Jul 2025, claiming to be the first PMS with it. — [Shepherd blog](https://www.shepherd.vet/blog/welcome-to-dark-mode-your-eyes-will-thank-you/)
- **Jane**: a client mobile app (US and Canada) lets patients view appointments and manage care across all their Jane clinics (Nov 2025). — [Jane press release](https://tools.prnewswire.com/en-us/live/20823/release/20251119EN27859)
- Open Dental appointment views are switchable by **function key**. — [Open Dental Manual](https://opendental.com/manual/appointments.html)

### Inferences
- Shipping dark mode would be a differentiator in this segment, not table stakes.

### Gaps
- Accessibility (WCAG) statements and clinician tablet apps (e.g. chairside tablet charting) were not researched.

## AI features 2024–2026 and how they surface in the UI

### Takeaway
AI shows up in four forms:
1. **Ambient or dictated notes** launched from the patient chart.
2. **Voice perio.**
3. **Imaging overlays.**
4. **Back-office "agents"** (confirmations, recall, eligibility, claims) that act on the schedule or ledger without a dedicated screen.

Plain-language "Ask" assistants arrived in 2025–2026 (Ask CurveAI for how-to help; Dentrix Ascend Ask for data queries). AI phone receptionists are mostly **third-party integrations**, not native.

### Cited Findings
- **Ask CurveAI** (2025): an in-platform 24/7 assistant giving step-by-step how-to guidance. — [Curve blog](https://curvedental.com/blog/thankful-for-curve-users)
- **Dentrix Ascend Ask** (Apr 2026 preview) and **packages on an "agentic platform architecture"** (Mar 2026). — [HS1 MCP](https://www.henryscheinone.com/about-us/press-release/dentrix-ascend-opens-mcp-layer/); [HS1 Mar 2026](https://www.businesswire.com/news/home/20260309270533/en/)
- **Planet DDS**: "DentalOS with AI", the first AI-native DSO platform (Sep 2025), with an early-access waitlist for AI Agents. Launched Jul 2026 with Confirmation and Recall agents live. — [BusinessWire Sep 2025](https://www.businesswire.com/news/home/20250925551066/en/Planet-DDS-Unveils-the-Industrys-First-AI-Native-Platform-for-DSOs); [Planet DDS Jul 2026](https://www.planetdds.com/newsroom/dentalos-enterprise-platform/)
- **AI phone agents for CareStack** come from third parties (Brilo, Peerlogic, Viva) plus the CareStack-branded **VoiceStack** AI receptionist phone system. No CareStack-built native agent announcement was found. — [VoiceStack AI Receptionist](https://voicestack.com/dental-phones/features/ai-receptionist); [Brilo](https://www.brilo.ai/integration/carestack); [Viva](https://www.getviva.ai/ai-dental-receptionist-for-carestack/)
- See the Clinical section for Voice Notes, Voice Perio, Detect AI, Image Verify, Jane AI Scribe, Pearl and Videa.

### Inferences
- "Clinician makes the final call" framing and draft-then-insert review are the consistent trust patterns.
- Agents are marketed by **outcome** (confirmed or rebooked appointments), not by UI. Their UI footprint is mostly schedule updates and worklists.

### Gaps
- Screenshots or UI descriptions of the Ask interface (placement, result format) were not available.

## Patient-facing (booking, forms, texting, portals)

### Takeaway
Patient engagement is being folded into the PMS: digital forms with AI capture, client mobile apps, in-app secure messaging, and auto-confirming reminders.

### Cited Findings
- Jane (Nov 2025): **secure messaging** with patients in Jane (online and in the app), a client mobile app, and an **AI-assisted website builder** (Jane Websites). — [Jane press release](https://tools.prnewswire.com/en-us/live/20823/release/20251119EN27859)
- DentalOS **Patient+**: "a connected patient digital experience across scheduling, forms, and communication" (Jul 2026). — [Planet DDS](https://www.planetdds.com/newsroom/dentalos-enterprise-platform/)
- Curve: online self-scheduling via Dental Intelligence (2022, older); Curve GRO auto-reminders (2024); **Curve Chat** HIPAA team chat (2025). — [PR Newswire 2022](https://prnewswire.com/news-releases/curve-dental-announces-integration-with-dental-intelligence-inc-to-offer-online-scheduling-301309878.html); [Curve blog](https://curvedental.com/blog/thankful-for-curve-users)
- Dentrix Ascend Digital Forms with AI photo capture (Mar 2026). — [HS1 Mar 2026](https://www.businesswire.com/news/home/20260309270533/en/)

### Gaps
- Unified-inbox UI for two-way texting and online-booking widget design were not found.

## General direction

### Cited Findings
- Cloud consolidation: DentalOS "cloud-native since 2003"; Imaging+ "removes per-location server infrastructure". — [Planet DDS](https://www.planetdds.com/newsroom/dentalos-enterprise-platform/)
- tab32 overhauled its UX after a Series B, adding AI-based tools (article date unconfirmed), and split into Alpine and Summit tiers in 2025. — [Orthodontic Products](https://orthodonticproductsonline.com/practice-products/software/practice-management-software/tab32-overhauls-dental-pms/); [tab32 about](https://tab32.com/about/)
- Henry Schein One is integrating AWS generative AI across Dentrix, Dentrix Ascend and Dentally (Dec 2025). — [Distribution Strategy](https://distributionstrategy.com/2025/12/henry-schein-one-launches-embedded-ai-workflows/)

### Inferences
- The direction is: cloud-native platform, then embedded voice and AI in clinical flow, then agents that automate front-desk loops, then plain-language querying and persona-oriented experiences. Visual layout conventions (chair-column calendar, icon statuses, waiting room, side lists) remain stable.
