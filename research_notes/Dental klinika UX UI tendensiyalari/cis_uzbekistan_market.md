# Dental and clinic management software in Russia/CIS and Uzbekistan: products, UX, and local constraints

> Scope note: about 18 tool calls. Coverage is uneven. IDENT, StomX, MacDent, Medesk and 1C have sourced detail. Dental4Windows, 32top, Archimed+, Clinicon, MedAngel, Infodent, Yclients/Dikidi and DocDoc/Prodoctorov were **not** researched in depth (see Gaps). Most review quotes come from crmindex.ru. Vendors reply to reviews there, so selection bias is likely.

## 1. Products and their UX (schedule, odontogram, patient card, cashier, reports; desktop vs cloud)

### Takeaway
The Russian-language dental software market is crowded and dominated by mature products. IDENT is a local-network desktop system with very large reach (4,400+ clinics, vendor claim). 1C:Медицина. Стоматологическая клиника is an "all-in-one" MIS+CRM. Cloud entrants include Medesk, StomX and MacDent. In Uzbekistan the most visible dental-specific competitor is MacDent, from Kazakhstan. Local Uzbek products such as Dental Soft and ClinicaGo exist but are small and thinly documented. Users praise a fast schedule and fast patient-card filling. They complain about admin workflow friction, rigid reports, missing branch support, weak messenger integration and price.

### Cited Findings
- **IDENT: scale and rating.** a2is.ru lists an average rating of 4.8/5 and "4400+ clinics" (the clinic count is a vendor figure). — [a2is IDENT reviews](https://a2is.ru/catalog/programmy-upravleniya-stomatologiyey/ident/reviews-ident)
- **IDENT is desktop/LAN.** Reviewers describe workstations "объединенных в локальную сеть" ("joined into a local network", Alexey Gerasimov, 21 Oct 2022). Another clinic moved from a cloud product and "решили искать локальную програму" ("decided to look for a local program", Anna Efimova, 9 Nov 2026). IDENT had no mobile app for directors. The vendor reply (11 Nov 2020) said demand was too low and offered doctors Google Calendar integration instead. — [crmindex IDENT reviews](https://crmindex.ru/products/ident/reviews)
- **IDENT praise** — [crmindex IDENT reviews](https://crmindex.ru/products/ident/reviews):
  - «Очень удобно работать с расписанием, можно быстро перенести пациента» — "Very convenient to work with the schedule, you can quickly move a patient" (Sofya, 29 Oct 2025)
  - «заполнение амбулатории секунд за 15-20» — "filling the outpatient record takes 15–20 seconds" (Vsevolod Larionov, 26 Sep 2022)
  - «Очень быстро заполняется первичный осмотр, случай обслуживания» — "The initial exam and service case fill in very quickly" (Darya Drozdovskaya, 8 Jun 2026)
  - «Раньше часть времени уходила на постоянные переключения между сервисами» — "Previously part of the time went to constantly switching between services" (V. Ladnik, 19 Jun 2026). This is an argument for keeping the card, images and plans in one window.
  - A separate a2is review praises having the patient card, X-rays and treatment plans in one window. — [a2is IDENT](https://a2is.ru/catalog/programmy-upravleniya-stomatologiyey/ident/reviews-ident)
- **IDENT complaints** — [crmindex IDENT reviews](https://crmindex.ru/products/ident/reviews):
  - «эффективность админа снижается в разы» — "the administrator's efficiency drops severalfold" (Yulia, 25 Apr 2026)
  - «вся работа сбрасывается, все фильтры, абсолютно все» — "all work resets, all filters, absolutely everything" (Yulia, 25 Apr 2026). This is state loss in the admin UI.
  - «Всю информацию о пациенте вы не найдете в его карте, например звонки и разговоры» — "You won't find all patient info in their card, e.g. calls and conversations" (Yulia, 25 Apr 2026)
  - «Функций действительно много, на первых этапах глаза разбегаются» — "There really are many functions; at first your eyes run wild" (Sofya, 29 Oct 2025). The interface is overwhelming at first.
  - «в поисковой строке пациентов, ищет только по фамилии» — "patient search only searches by surname" (Viktoria, 21 Nov 2022)
  - «Нужен какой-то нестандартный отчет? Забудьте» — "Need a non-standard report? Forget it" (Nikolai, 3 Dec 2022)
  - «Программа не умеет вести филиальную структуру, у каждой клиники будет своя база» — "The program can't handle a branch structure; each clinic gets its own database" (Nikolai, 3 Dec 2022)
  - «Функционал застрял лет на 5-7» — "Functionality is stuck 5–7 years back" (Nikolai, 3 Dec 2022)
  - «Хотелось бы, чтобы можно было чатиться с пациентами в мессенджерах» — "Would like to chat with patients in messengers" (O. Erkhaleva, 14 Jun 2024)
  - «айдент может отправлять только супер дорогие смски» — "IDENT can only send super-expensive SMS" (M. Burguev, 21 Jul 2023)
  - Integrations are limited to the UIS and Mango telephony providers (quality dept., 14 Oct 2025).
  - «Отсутствие поддержки 4k, 5k экранов» — "No support for 4K/5K screens" (21 Jul 2023)
  - On price: «высокая стоимость самой программы и обновлений» — "high cost of the program and updates" (2019). Also «своих денег не стоит» — "not worth its money" (2023).
- **StomX (cloud + mobile app)** — [crmindex StomX reviews](https://crmindex.ru/products/stomx/reviews):
  - «дружественный интерфейс - доктора и администраторы (даже те, у кого сложности с компьютерами) быстро разобрались» — "friendly interface; doctors and admins (even those who struggle with computers) figured it out quickly" (A. Skantseva, 12 Sep 2023)
  - The same reviewer praises «ортодонтическая карта… удобная зубная формула» ("orthodontic chart… convenient tooth chart").
  - «Очень удобно, что есть мобильное приложение, можно вести запись, даже не находясь на клинике» — "Very convenient there's a mobile app; you can manage bookings without being at the clinic" (Tatyana, 29 May 2023)
  - Requested features: a doctor-status marker ("в отпуске", "на больничном" — on vacation / on sick leave) and a waiting list («отсутсвие листа ожидания», 15 Aug 2023).
  - Complaints: «Есть ошибки в кассе, но их исправляют» — "There are bugs in the cashier, but they fix them" (2 Oct 2023). One reviewer also reports data deletion where support did not help (5 Jan 2026).
- **StomX features and price.** Features include an EMR, analytics, a patient portal, consumables tracking and e-signature. It is in the Russian software registry (#23390). Price starts at ~6,700 RUB. — [a2is StomX](https://a2is.ru/catalog/programmy-upravleniya-stomatologiyey/stomx)
- **Medesk.** Positioned as "all-in-one" MIS+CRM in one database (doctor schedule, EMR, marketing reports), with a 1-day cloud start and a mobile cabinet. — [a2is best dental services](https://a2is.ru/publications/meditsina/luchshie-servisy-dlya-stomatologii-2023) (catalog snippet; the page did not render when fetched)
- **1C:Медицина. Стоматологическая клиника.** Described as "all-in-one", from MIS to a full CRM with sales funnels, from 2,100 RUB/month. — [a2is 1C](https://a2is.ru/catalog/programmy-upravleniya-stomatologiyey/1c-stomatologicheskaya-klinika)
- **MacDent (cloud, Kazakhstan).** — [digitalbusiness.kz](https://digitalbusiness.kz/en/2025-11-21/kazakhstani-entrepreneur-on-maternity-leave-launches-startup-that-helps-dentists-work-smarter/); WhatsApp reminders per [toolfox MacDent](https://toolfox.ru/services/s/macdent)
  - Scale: 1,800+ dental clinics, mainly in Astana and Almaty. It operates in Kazakhstan, Uzbekistan, Kyrgyzstan and Russia, and the founder names Uzbekistan as a main focus with "recently increased activity". Turnover is ~$1M. The subscription averages ~500,000 KZT/year.
  - Features: unified inbox for all incoming messages, missed-call tracking, a lead→appointment→treatment funnel, treatment-plan follow-up, and an AI booking agent.
  - Toolfox describes it as a cloud CRM with a tooth chart, EMR and WhatsApp reminders.
- **CRM vs MIS split.** In the Russian market, an MIS is the doctor's tool (tooth chart, medical card, protocols, EGISZ exchange). EGISZ is Russia-specific and irrelevant to Uzbekistan. — [toolfox](https://toolfox.ru/services/crm-sistemy/crm-dlya-stomatologii)
- **Uzbek-made products:**
  - *Dental Soft* is listed as "dental clinics SaaS", with an IT Park tag and a Tashkent address. Details are thin. — [Startup Base](https://startupbase.uz/en/startups/1666)
  - *ClinicaGo* (CoreMed, Tashkent) is a general clinic CRM/EMR.
    - The founder writes: "Most private clinics here still run on paper": a registry desk with folders, a separate notebook for money, and doctors who cannot see earlier visits.
    - "Imported clinic systems charge per user in dollars and have poor translations."
    - Money is tracked in soums, including discounts, debts and expenses at the cash desk. The owner reads a daily finance report.
    - Roles: CEO, reception, doctor, call centre.
    - Features are gated by clinic type because "terms mean different things in a dental clinic than in a health centre".
    - [dev.to ClinicaGo](https://dev.to/diyor011/building-clinicago-a-clinic-crm-and-emr-for-private-clinics-in-uzbekistan-47g8)
- **Generic CRM pricing in Uzbekistan.** Spot.uz (2020) says most CRM vendors sell subscriptions from ~$30/month. tegCRM costs $70/month for 7 users. — [Spot.uz](https://www.spot.uz/ru/2020/10/30/crm/)

### Inferences
- The recurring praise is about speed of core loops: rescheduling, filling the exam or visit record, and having everything in one window. The recurring complaints are about the admin/reception role: lost filters, surname-only search, call history missing from the card, and no messenger chat. Reception UX is where incumbents are weakest.
- Branch support, custom reports, messenger integration and affordable SMS are explicit gaps in IDENT. All four already exist in this project (multi-branch, per-tenant Telegram/Eskiz).
- Desktop/LAN is still accepted, and sometimes preferred, by RU clinics, since one reviewer left cloud for local. That supports an offline-capable desktop install.
- Per-user dollar pricing and poor translation are named pain points for foreign software in Uzbekistan. Native Uzbek language support and soum-based flat pricing are likely differentiators.

### Gaps
- No primary-source UI detail was gathered on how IDENT, 1C, Dental4Windows or others visually design the odontogram, schedule grid or cashier. Vendor help pages and demos were not fetched.
- No data was found on Dental4Windows, 32top/Stomatology, Archimed+, Clinicon, MedAngel, Infodent, Yclients/Dikidi or DocDoc/Prodoctorov integrations.
- No otzovik.com, irecommend, habr or stomatologclub.ru reviews were collected. Every quote comes from crmindex.ru, where vendors respond to reviews.
- No market-share data was found on which software Uzbek dental clinics actually use.
- Kazakhstan products other than MacDent were not researched.

## 2. Local context in Uzbekistan (language, messaging, SMS, connectivity, payments, fiscal, data law, market size)

### Takeaway
Telegram is the near-universal channel: 86.1% of adults use it (2026), and 70% named it their main messenger (2023). Private clinics deliver ~91% of dental services, among 9,000+ private medical organizations. Payments are moving fast toward cards and smartphones, but cash is still ~57% of payments. Clinics have paid VAT since April 2025, with VAT reports generated from online or virtual cash register receipts. The 2021 data-localization rule was relaxed in March 2026, but sensitive categories must still be stored in Uzbekistan.

### Cited Findings
- **Telegram usage.** A Sept 2026 national survey of 1,411 adults found 86.1% use Telegram (94.7% of 18–24s). 51.6% name Telegram channels as a news source, versus 44.6% for TV. — [Daryo 2026](https://daryo.uz/2026/11/03/telegram-ranks-as-top-news-source-in-uzbekistan-study-shows/)
- **Telegram vs other messengers.** In late 2023, 70% of Uzbeks named Telegram their most-used messenger, versus 18% for WhatsApp and 4% for IMO. — [CA-Barometer](https://ca-barometer.org/en/publications/which-messaging-apps-are-popular-in-uzbekistan-kyrgyzstan-and-kazakhstan)
- **Internet and social media.** Internet users numbered 32.7M (89.0% penetration) in Jan 2025. Social media identities numbered 11.7M (31.7%). DataReportal does not report a Telegram figure. — [DataReportal 2025](https://datareportal.com/reports/digital-2025-uzbekistan)
- **Language.** Russian is widely used in business and workplace communication, especially in cities. Older generations prefer Cyrillic Uzbek, younger people read both scripts, and government documents remain largely Cyrillic. The full switch to Latin was decreed in 2021, but sources disagree on dates. — [Languages of Uzbekistan (Wikipedia mirror)](https://kaweah.freedombox.rocks/kiwix/wikipedia_en_all_maxi_2023-10/Languages_of_Uzbekistan); [The Diplomat 2023](https://thediplomat.com/2023/01/uzbekistans-drawn-out-journey-from-cyrillic-to-latin-script)
- **SMS.** Eskiz publishes its tariffs only at eskiz.uz/sms; a Bitrix24 app page says they change over time. Third-party international rates vary widely ($0.11–$0.46 per SMS via Plivo/Twilio, Nov 2025). Sender-ID pre-registration rules conflict between sources (UMS 3–5 business days, Ucell/Beeline registration required). — [Bitrix24 Eskiz app](https://www.bitrix24.ru/apps/app/vebpult.eskiz_sms_shlyuz_uzbekistan/); [sent.dm](https://www.sent.dm/resources/uzbekistan-sms-pricing); [d7networks regulations](https://d7networks.com/sms/uzbekistan/sms-regulations/)
- **Payments.**
  - KPMG for the Central Bank: card cashless volume reached ~72% of nominal GDP in 2025, up from ~25% in 2021. The cashless share of card payments rose from 68% to 81%. — [KPMG 2026](https://kpmg.com/uz/ru/insights/2026/09/overview-of-payment-organizations.html)
  - Cash share of payments was 57% in H1 2025, down from 59%; terminals had 43%. — [Spot.uz 2025](https://www.spot.uz/ru/2025/07/24/cash/)
  - The smartphone is now the main payment tool, and the cash decline is concentrated in large cities including Tashkent. — [Podrobno.uz](https://podrobno.uz/cat/obchestvo/bolshe-poloviny-cherez-smartfon-kak-menyaetsya-rynok-platezhey-v-uzbekistane/)
  - ~90% of payment-company revenue comes from P2P, bill-payment and acquiring fees. — [Kun.uz 2026](https://kun.uz/en/news/2026/05/19/how-do-people-in-uzbekistan-pay-and-who-leads-the-market)
  - No source split the market between Click, Payme, Uzcard and Humo.
- **Fiscal.**
  - Sellers must issue online or virtual cash register receipts (PQ-5813); virtual registers are governed by Resolution No. 943 (23 Nov 2019). — [Kun.uz 2019](https://m.kun.uz/en/news/2019/09/07/uzbekistan-to-introduce-virtual-cash-desks)
  - From 1 April 2025, clinics and pharmacies pay VAT, and tax authorities auto-generate VAT reports from online/virtual cash register receipts. — [Kun.uz Dec 2024](https://kun.uz/en/news/2024/12/31/uzbekistan-introduces-vat-for-pharmacies-and-clinics-from-april-2025)
- **Personal data law.**
  - Article 27-1 of the Law "On Personal Data" (ZRU-666, 14 Jan 2021; in force April 2021) required processing of citizens' data on technical means physically in Uzbekistan, registered in the State Register of personal databases. — [Mondaq](https://www.mondaq.com/data-protection/1197754/the-law-on-personal-data-has-been-amended)
  - A March 27, 2026 amendment allows most data abroad under conditions. Biometric/genetic data and telecom-subscriber data must stay domestic. — [Kun.uz Mar 2026](https://kun.uz/en/news/2026/03/27/uzbekistan-amends-personal-data-law-to-facilitate-global-payment-systems); [Times of Central Asia](https://timesca.com/uzbekistan-eases-data-localization-rules-to-support-global-payment-platforms/)
- **Market size.**
  - «stomatologik tashxis hamda muolajalarning 91 foizi aynan xususiy klinikalar tomonidan ko'rsatilyapti» — "91% of dental diagnostics and treatments are provided by private clinics". The article is dated 14 Jul 2024 and cites no underlying source. The same article says private hospitals grew from 3,200 to 8,800 in 8 years, about 500–600 a year. — [Anhor.uz](https://anhor.uz/uzl/news/o-zbekistonda-stomatologiya-xizmatlarining-91-foizi-xususiy-klinikalar-tomonidan-ko-rsatilyapti/)
  - There are 9,000+ private medical organizations, 1,329 of them opened in the past year, and ~27% were not operating at their registered addresses as of 1 Jan 2025. — [Anhor.uz](https://anhor.uz/healthcare/klinik/); [Podrobno.uz](https://podrobno.uz/cat/obchestvo/svyshe-1300-chastnykh-klinik-otkrylis-v-uzbekistane-za-god/)
  - The private share of healthcare reached 30%. — [Kursiv 2024](https://uz.kursiv.media/2024-12-23/dolya-chastnikov-v-zdravoohranenii-uzbekistana-dostigla-30/amp/)
- **Local dental tech demand.** The IDECA Tashkent dental expo (14–16 May 2025) drew foreign digital vendors such as Medit. — [Medit](https://www.medit.com/ideca-tashkent/)

### Inferences
- The UI needs Uzbek Latin and Russian as first-class languages. Uzbek Cyrillic may matter for older staff and patients, but no clinic-specific data confirms it.
- Telegram should be the default patient channel, with SMS as a fallback. IDENT users' complaints about expensive SMS reinforce this.
- The cashier must handle cash plus card/QR/Click/Payme and fiscal receipts. Since VAT reporting now flows from receipts, real fiscal integration has become more important for clinics since 2025.
- Medical data is not explicitly named among the categories that must stay domestic after 2026. Sources do not say how medical records are treated, so local or on-prem storage remains the safe default. That favors the local-desktop model.

### Gaps
- No sources on internet reliability or outages in Uzbek regions, or on desktop OS prevalence (Windows share) in clinics.
- No authoritative count of dental clinics; no confirmation of the year or method behind the 91% figure.
- No official lex.uz text on which medical services require fiscalization, or on exemptions.
- Not covered: medical-data classification under the 2026 amendment, and licensing rules for medical record software.
- No current Eskiz or Play Mobile pricing.

## 3. How patients book in Uzbekistan

### Takeaway
Booking is mostly by phone and Telegram (plus WhatsApp), often through aggregators such as med24.uz that themselves book via Telegram. No quantitative data was found on how bookings split across channels.

### Cited Findings
- med24.uz, a clinic catalog, invites patients to "Напишите нам в Telegram, мы бесплатно подберём врача и запишем вас на приём" ("Write to us on Telegram, we'll pick a doctor for free and book you"). Clinic cards such as Smile Concept list "Запись на приём онлайн или по телефону" ("Booking online or by phone"). — [med24.uz Smile Concept](https://med24.uz/klinika/smileconcept)
- Iftixor Dental Clinic (Tashkent) takes questions "через Telegram или WhatsApp" ("via Telegram or WhatsApp") at a listed number. — [Google Business](https://business.google.com/v/iftixor-dental-clinic/09828568583844557013/81cd/_)
- r/Uzbekistan users say Tashkent clinics respond faster on Telegram than by email, and note that "Telegram only works with mobile numbers, not landline". — [Reddit mirror](https://lr.eu.psf.lt/r/Uzbekistan/comments/1k1yrdw/dentist_in_tashkent)
- A Russian example of a Telegram booking bot (Dentika chain, Russia, not Uzbekistan): /start → name+phone → consent → admin one-click approval. It produced 600 bookings in the first weeks. — [workspace.ru case](https://workspace.ru/cases/telegram-bot-dlya-seti-stomatologiy-dentika-600-zapisey-za-pervye-nedeli/)
- ClinicaGo's founder describes a registry desk with folders and a separate money notebook, i.e. paper-based scheduling. — [dev.to ClinicaGo](https://dev.to/diyor011/building-clinicago-a-clinic-crm-and-emr-for-private-clinics-in-uzbekistan-47g8)

### Inferences
- Reception UX should treat the phone number as the primary patient key and make Telegram-originated bookings first-class. A bot-to-admin approval flow matches the observed pattern.
- MacDent's unified inbox and missed-call tracking target exactly this phone+messenger booking reality.

### Gaps
- No data on Instagram's share of booking, or on online booking adoption via aggregators (med24.uz, 103.uz).
- No survey of patient booking preferences in Uzbekistan.
