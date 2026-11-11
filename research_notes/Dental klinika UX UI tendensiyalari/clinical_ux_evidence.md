# Clinical software usability evidence (EHR / EDR / practice management) and its effects on clinicians

Scope note: around 20 searches and fetches. Most figures come from abstracts, PubMed/PMC records or reputable secondary coverage. Full texts were read only where noted: Walji 2012 via PMC. PMC fetches were sometimes blocked by a browser check. Treat numbers marked "(secondary)" as needing a check against the original before formal citation.

## 1. EHR usability measurements: SUS, burnout, EHR time, clicks

### Takeaway
Physicians rate EHR usability very poorly: mean SUS of about 46 (grade "F", bottom 9%). Burnout falls in a dose-response way as usability improves: each SUS point is worth about 3% lower odds of burnout. EHR and desk work takes about half of physician time, plus 1–2 hours after hours. Click and time burden is the measurable lever.

### Cited Findings
- **Melnick et al. 2020, Mayo Clin Proc 95(3):476-487** (online Nov 2019). This was a national US physician survey (AMA 2017 burnout survey plus a usability subsurvey, n=870 of 1,250 invited). Mean EHR **SUS = 45.9 ± 21.9**, which is the **bottom 9%** of SUS scores across prior studies (grade F). **Each 1-point higher SUS was associated with 3% lower odds of burnout (OR 0.97; 95% CI 0.97–0.98; P<.001)**, a "strong dose-response relationship". Limitation: usability was self-reported perception. — [PubMed 31735343](https://pubmed.ncbi.nlm.nih.gov/31735343/); [EurekAlert release](https://www.eurekalert.org/news-releases/529537)
- **Arndt et al. 2017, Ann Fam Med 15(5):419-426, "Tethered to the EHR".** Epic event logs from 142 family physicians, validated by direct observation. **5.9 h of EHR time per weekday per 1.0 clinical FTE** (about 4.5 h during clinic, 1.4 h after clinic). **Clerical/administrative work was about 44%** of EHR time and **inbox management about 24%** (about 85 min/day). — [Ann Fam Med abstract](https://www.annfammed.org/content/15/5/419)
- **Arndt et al. 2024, Ann Fam Med 22(1):12.** Follow-up showing total EHR time **kept rising through 2023**. Inbox time stayed above pre-pandemic levels. — [Ann Fam Med](https://www.annfammed.org/content/22/1/12)
- **Sinsky et al. 2016, Ann Intern Med (doi 10.7326/M16-0961).** Time-and-motion study of 57 physicians over 430 h in 4 specialties. **49.2% of the day on EHR/desk work vs 27% direct face time.** In the exam room itself, 37% was EHR/desk work and 52.9% face time. Diary keepers reported **1–2 h each night** of after-hours work, mostly EHR. AMA-funded. — [Healio summary](https://www.healio.com/primary-care/practice-management/news/online/%7B063320c8-6954-45b8-89dc-3b293772d441%7D/physicians-spend-nearly-50-of-their-time-on-ehr-desk-work)
- **Hill, Sears, Melanson 2013, Am J Emerg Med 31:1591-1594, "4000 Clicks"** (landmark, older). In a community-hospital emergency department, **about 4,000 mouse clicks per busy 10-h shift** (extrapolated from 30 observed hours at about 2.5 patients/h). **43% of time went to data entry vs 28% to direct patient contact.** Small single-site sample, and the click figure is an extrapolation. — [AJEM full text](https://ajemjournal.com/article/S0735-67571300405-1/fulltext); [Becker's](https://www.beckershospitalreview.com/healthcare-information-technology/4-000-clicks-per-shift-ed-physicians-emr-burden)
- **Usability and patient harm, Howe et al. 2018, JAMA 319(12):1276-1278.** Of 1.735 million safety reports (Pennsylvania plus one mid-Atlantic system, 2013–2016), **1,956 (0.11%) named an EHR and possible harm**, and **557 (0.03%) explicitly implicated EHR usability**. The authors note this is a conservative undercount because reporting captures only a fraction of incidents. — [AHRQ PSNet](https://psnet.ahrq.gov/issue/electronic-health-record-usability-issues-and-potential-contribution-patient-harm)
- **Pediatric companion study (Ratwani/Howe group, Health Affairs 2018).** Across 9,000 safety reports from 3 institutions, **36% related to EHR usability issues**. — [HCInnovation](https://www.hcinnovationgroup.com/clinical-it/news/13030882/ehr-usability-issues-impact-pediatric-patient-safety-research-finds); [MedStar](https://medstarhealth.org/mhs/2018/11/05/additional-safety-measures-recommended-after-study-finds-ehr-usability-issues-pose-risk-to-children)

### Inferences
- The SUS–burnout gradient makes SUS a defensible KPI. A target of SUS ≥68 (the commonly used "average" benchmark) would put a product well above the typical EHR at about 46. The 68 benchmark is general SUS literature and was not verified in this session.
- Clerical work (44%) and inbox work (24%) are the biggest EHR time sinks. For a dental product, delegating clerical entry to reception and assistants and keeping notifications concise likely matters more than polishing clinical screens.
- Clicks per task and after-hours time are measurable proxies that can be instrumented in-product (event logs, as in Arndt).

### Gaps
- No dental-specific large-scale study of "EHR time per day" or "clicks per visit" for dentists was found.
- The SUS 68 benchmark and adjective grades (Bangor/Sauro) were not fetched in this session.

## 2. Dental-specific EHR/EDR usability (Walji, Kalenderian, Thyvalikakath, Schleyer)

### Takeaway
Dental EHRs have documented, severe usability problems. In formal tests of four market-leading charting systems, novice users completed only 16–64% of tasks correctly. In a structured-diagnosis-entry study, task success ranged from 41% down to 0%, with SUS of about 57. The fixable causes recur: codes shown instead of names, poor sorting, misleading labels, single- vs double-click traps, a free-text bypass, and missing synonym search.

### Cited Findings
- **Walji, Kalenderian et al. 2013 (online 2012), Int J Med Inform 82(2):128–138, doi 10.1016/j.ijmedinf.2012.05.018.** Diagnosis entry (EZCodes terminology) in axiUm at Harvard and UCSF, n=68 (mostly 3rd/4th-year students). Read in full via PMC.
  - Task success: **41%** (single diagnosis, Task 1A), **22%** (Task 1B), **0%** (comprehensive treatment plan with 5 diagnoses).
  - Time: successful Task 1A took **3 min 8 s vs an expert keystroke-level benchmark of about 54 s**. Task 2 attempts took **15 min 36 s vs about 4 min 39 s**.
  - **SUS 56.9 (SD 14.3)**.
  - **24 high-level usability problems**: 38% interface, 25% terminology, 38% work domain. 63% were rated high priority. User testing detected 83% of problems, interviews 63%, observation 38%.
  - Example problems: terms sorted by numeric code rather than name; truncated labels and abbreviations; a diagnosis lost on single-click instead of double-click; a misleading "Update" label for adding; a free-text bypass of the structured entry; only one diagnosis per treatment; no decision support.
  - Recommended fixes: show term names and hide codes, sort alphabetically, disable free text, add synonym and misspelling search, allow multiple diagnoses per treatment, distinguish working from definitive diagnoses.
  - — [PMC3492538](https://pmc.ncbi.nlm.nih.gov/articles/PMC3492538)
- **Walji et al. 2014, "Are three methods better than one?"** User testing, interviews and surveys were **complementary**: each found unique problems, so the authors recommend multi-method evaluation. — [PubMed 24583045](https://pubmed.ncbi.nlm.nih.gov/24583045/)
- **Thyvalikakath, Monaco, Thambuganipalle, Schleyer 2008, JADA (doi 10.14219/jada.archive.2008.0105)** (landmark, older). Formal usability tests of the charting modules of **Dentrix, EagleSoft, SoftDent and PracticeWorks** (4 groups × 5 novice users). Results: **correct task completion 16–64%, incorrect 18–38%, incomplete 9–47%**, and **286 usability problems** traced to 6 problematic interface/interaction designs. The authors' conclusion was a steep learning curve and reduced adoption (secondary, abstract-level). — [record](https://searchworks.jioinstitute.edu.in/articles/cmedm__19047669); [PMC2736678](https://pmc.ncbi.nlm.nih.gov/articles/PMC2736678) (fetch blocked)
- **Thyvalikakath et al. 2009, Stud Health Technol Inform.** Heuristic evaluation of the same 4 systems (about 80% of the US chairside market) found about **50% of the problems that user testing found**. The most-violated heuristics were **"Consistency and standards", "Match between system and real world" and "Error prevention"** (secondary). — [ProQuest scholar listing](https://scholars.proquest.com/gallery/indiana/profiles/B03F8595AC1BA51A1E0C70CD511BC8F7/publications?page=3)
- **Thyvalikakath 2012, PhD dissertation (Pittsburgh).** Cognitive task analysis of dentists' information use during a typical exam, used to design EDR data presentation. — [d-scholarship.pitt.edu](https://d-scholarship.pitt.edu/13518/1/Thyvalikakath_PhD%2Ddissertation%2DETD_Final_081112.pdf)
- **iTooth touch-based tooth-charting app (Marshfield Clinic student project).** **SUS 67.75, NPS 0.** **78%** of participants could not locate a particular icon, and **44%** were confused by charting statuses. This is not peer-reviewed. — [Marshfield SRIP](https://www.marshfieldresearch.org/srip/students/adam-sorenson)
- **"Smart odontogram" usability test, Padjadjaran J Dent 2022.** Reported good effectiveness, efficiency and satisfaction. This is a small regional study. — [DOAJ](https://doaj.org/article/f5e4ee95eed1412a87777b9a2f3396a9)
- **Salud EDR usability assessment** (Clin Cosmet Investig Dent, vol. 17). Think-aloud plus SUS evaluation of a Saudi EDR. — [Dovepress](https://www.dovepress.com/usability-assessment-of-salud-electronic-dental-record-system-peer-reviewed-fulltext-article-CCIDE)

### Inferences
- In the odontogram and diagnosis/treatment entry:
  - Show human-readable names, not codes.
  - Support search with synonyms and misspellings.
  - Avoid modes where single- vs double-click changes the outcome.
  - Use verb-accurate button labels ("Add diagnosis", not "Update").
  - Allow several diagnoses per procedure.
  - Make tooth and surface status legible: 44% were confused by statuses in iTooth.
- The 3–4× gap between novice and expert time in Walji suggests designing for first-week users (discoverability) matters as much as expert shortcuts.
- Testing should combine think-aloud user testing (it found 83% of problems) with interviews. Heuristic review alone finds about half.

### Gaps
- No peer-reviewed SUS benchmark was found for commercial dental PMS products (Dentrix, Open Dental, Curve, Dentally) in 2018–2026.
- The Walji/Kalenderian follow-ups on post-redesign usability (e.g., DDS terminology, "Dental Diagnostic System") were not retrieved in this session.
- No controlled study comparing odontogram interaction styles (graphical tooth click vs grid vs voice) was found.

## 3. Alert fatigue: override rates, interruptive vs non-interruptive, allergy/medical alerts

### Takeaway
Clinicians override 46–96% of medication alerts and 44–97% of drug-allergy alerts, and many of those overrides are clinically appropriate. Tiering by severity, with interruptive alerts kept only for the most severe, raised acceptance of severe alerts from 34% to 100%. When alert burden and presentation changed after an EHR switch, acceptance fell to 8.4%. Design and burden matter as much as the knowledge base.

### Cited Findings
- **Systematic review of drug-allergy alert systems, Int J Med Inform 2022 (28 articles).** **Override rates 43.7%–97%.** These alerts are usually interruptive, often fire on non-exact matches, and often require an override reason. The main override reason was **"patient previously tolerated the drug"**. — [PubMed 34990941](https://www.pubmed.gov/34990941/)
- **Systematic review of appropriateness of overridden CPOE alerts, JMIR Med Inform 2020 (23 articles).** **Override rate 46.2%–96.2%.** Drug-allergy override **appropriateness 63.4%–100%**, which makes these alerts a priority for redesign. — [PMC7400042](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7400042/)
- **Systematic review of drug-allergy checking CDSS, JMIR 2018.** Override rates up to 90%. Adverse drug events from overridden allergy alerts were infrequent, but only one study reported that outcome. — [JMIR 2018 e258](https://jmir.org/2018/9/e258/PDF)
- **Paterno et al. 2009, JAMIA 16(1):40.** Two hospitals used the same interaction knowledge base, but only one tiered alerts by severity, with hard stops for the top tier. Across 71,350 alerts, **overall compliance was 29% (tiered) vs 10% (non-tiered)**, and **acceptance of the most severe alerts was 100% vs 34%**. — [JAMIA](https://academic.oup.com/jamia/article/16/1/40/865495); [PMC2605599](https://pmc.ncbi.nlm.nih.gov/articles/PMC2605599)
- **Wright et al. (J Gen Intern Med 2018, doi 10.1007/s11606-018-4415-9).** After a switch to a commercial EHR, acceptance of the most severe alerts **fell from 100% to 8.4%**, attributed to changes in alert burden and presentation (secondary). — [Springer PDF](https://rd.springer.com/content/pdf/10.1007/s11606-018-4415-9.pdf)
- **Shah et al. 2006 (ambulatory), listed in the AHRQ toolkit.** Limiting interruptive alerts to fewer, high-severity ones gave **67% acceptance** of interruptive alerts. — [AHRQ digital](https://digital.ahrq.gov/health-it-tools-and-resources/workflow-assessment-health-it-toolkit/research/shah-nr-et-al-2006)
- **Dental-specific medical-history CDSS (HealthPartners, AHRQ-funded RCT, 102 dentists / 15 clinics).**
  - EHR decision support **raised how often dentists reviewed guidelines for medically complex patients** and improved medical-history documentation accuracy.
  - There was **no significant effect on patient complications**, but baseline complication rates were low.
  - — [AHRQ project summary](https://digital.ahrq.gov/ahrq-funded-projects/ehealth-records-improve-dental-care-patients-chronic-illnesses/annual-summary/2011); [HealthPartners](https://healthpartners.com/knowledgeexchange/display/document-rn30652)
- **Paper vs digital dental record comparison (2025, PMC12745653).** 200 records, 20 students. With the EHR, **all students noticed the highlighted serious-pathology message on opening the record**. The same source cites a US cohort in which **15.1% of patients with diabetes and 29.0% with hypertension did not disclose these conditions to their dentist**. — [PMC12745653](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12745653/)
- **Michigan medical–dental record linkage (159,733 shared patients).** The dental EHR was the record most affected by **medication omissions**. The source was a proxy mirror and should be verified. — [PMC6541474](https://pmc.ncbi.nlm.nih.gov/articles/PMC6541474)

### Inferences
- For the dental product:
  - Show critical medical flags (anticoagulants, bisphosphonates, allergy to local anaesthetic or latex, endocarditis risk, pregnancy, diabetes) as a **persistent, non-interruptive banner in the patient header**.
  - Reserve **interruptive** modals for a short severity-tiered list (e.g., a prescribing drug-allergy match) at the moment of action.
  - Avoid a blocking pop-up on every chart open.
- Capture the common override reason ("previously tolerated") as structured data so the same alert does not refire.
- Patient non-disclosure (15–29%) argues for an easy medical-history update at each visit, for example a reception or tablet questionnaire that clinicians confirm.

### Gaps
- No dental-specific study of alert override rates (e.g., for antibiotic-prophylaxis or anticoagulant prompts) was found.
- No dental study directly compares banner vs modal presentation of medical alerts.

## 4. Cognitive load and information design (patient summary/header, overload, navigation, consistency)

### Takeaway
The strongest experimental evidence comes from ICU work at Mayo (AWARE). A condensed, prioritized patient-summary interface reduced task load and cognitive errors compared with the standard EHR. Dental heuristic studies show that "consistency and standards" and "match with the real world" are the most-violated principles. Direct evidence on tabs vs single-page in dental software was not found.

### Cited Findings
- **Ahmed et al. 2011, Crit Care Med 39(7):1626-1634.** A comparison of two EHR interfaces. The AWARE (prioritized, condensed) interface **improved provider task load, errors of cognition and performance** over the standard EHR. Exact effect sizes were not retrieved. — [PMC3632280](https://pmc.ncbi.nlm.nih.gov/articles/PMC3632280); [HCInnovation on Mayo AWARE](https://www.hcinnovationgroup.com/clinical-it/electronic-health-record-electronic-medical-record-ehr-emr/article/13009527/how-mayo-clinic-is-combating-information-overload-in-critical-care-units)
- **AWARE randomized crossover trial (NCT05937646, protocol JMIR Res Protoc 2025).** 120 ICU providers at 4 centres. Outcomes include eye fixations per case and NASA-TLX. No results were published as of the search. The protocol states that EHR information overload causes clinicians to **miss critical information, make errors and delay care**. — [PubMed 39932774](https://pubmed.ncbi.nlm.nih.gov/39932774/)
- **Dental heuristic findings.** The most-violated heuristics in 4 commercial dental record systems were **consistency and standards, match between system and real world, and error prevention** (secondary). — [Thyvalikakath 2009 listing](https://scholars.proquest.com/gallery/indiana/profiles/B03F8595AC1BA51A1E0C70CD511BC8F7/publications?page=3)
- **Development and usability of a patient medical summary application for dental clinicians** (AHFE/CMS conference proceedings). A dedicated medical-summary view for dentists. Details were not retrieved. — [CMS Conferences](https://openaccess.cms-conferences.org/publications/book/978-1-964867-70-0/article/978-1-964867-70-0_12)

### Inferences
- Use a single prioritized patient overview: medical alerts, active treatment plan stage, balance, next appointment. That is the evidence-aligned alternative to scattering critical data across tabs.
- Keep tabs for depth, with critical items always visible in the header.
- Consistency across modules (same verbs, same status colours) directly targets the most-violated dental heuristic.

### Gaps
- No controlled study comparing tabbed vs single-page patient charts in dental or medical software was found.
- Problem-list visibility studies (e.g., Wright et al. on problem-list completeness) were not retrieved.

## 5. Ambient AI scribes (2024–2026)

### Takeaway
RCT evidence shows modest documentation-time gains: about 10% less time-in-note for one product, and no significant change for another. Pre/post and large-deployment data show burnout reductions (51.9% to 38.8%) and large aggregate time savings. Accuracy is the risk: in a 2026 audit, 18% of notes had omissions, 11.5% had hallucinations, and 5.3% had errors posing serious risk. Clinician review stays mandatory.

### Cited Findings
- **Lukac et al. 2025, NEJM AI, "Ambient AI Scribes in Clinical Practice: A Randomized Trial" (doi 10.1056/AIoa2501000).** 238 outpatient physicians, 14 specialties, randomized 1:1:1 to DAX Copilot, Nabla or usual care (Nov 2024–Jan 2025, single academic centre, UCLA).
  - **Nabla: −9.5% time-in-note (95% CI −17.2 to −1.8; P=0.02). DAX: −1.7% (NS).**
  - Secondary signals of improvement in burnout, task load and work exhaustion; these need confirmation.
  - Notes **"occasionally" contained clinically significant inaccuracies**, mostly omissions and pronoun errors. **1 mild patient-safety event.**
  - — [PubMed 41497288](https://pubmed.ncbi.nlm.nih.gov/41497288/); [UCLA release](https://www.uclahealth.org/news/release/ucla-study-finds-ai-scribes-may-reduce-documentation-time)
- **Afshar et al. 2025, NEJM AI (doi 10.1056/AIoa2500945).** Stepped-wedge pragmatic trial. **Documentation time fell by 0.36 h/day without loss of note quality**, and diagnostic billing coding improved (P<.001) (secondary). — [Consultant360](https://www.consultant360.com/exclusive/ambient-ai-scribes-linked-lower-work-exhaustion-multistate-pragmatic-trial)
- **JAMA Netw Open 2025; 8(10):e2534976.** Quality-improvement pre/post study, 263 clinicians, 6 health systems, 30 days. **Burnout 51.9% to 38.8% (OR 0.26; 95% CI 0.13–0.54).** After-hours documentation **−0.90 h/week**. No control group. — [PubMed 41037268](https://pubmed.ncbi.nlm.nih.gov/41037268/); [PMC12492056](https://pmc.ncbi.nlm.nih.gov/articles/PMC12492056/)
- **UChicago, JAMA Netw Open Oct 2025, "Use of an AI Scribe and EHR Efficiency".** Matched comparison: users spent **8.5% less total EHR time** than matched non-users, and **more than 15% less note-composition time**. — [UChicago Medicine](https://www.uchicagomedicine.org/forefront/research-and-discoveries-articles/2025/november/ambient-ai-saves-time-reduces-burnout-fosters-patient-connection)
- **Kaiser Permanente (TPMG), NEJM Catalyst 2025.**
  - 7,260 physicians, about **2.5 million encounters** (Oct 2023–Dec 2024).
  - **About 15,791 h of documentation saved** (an estimate vs non-users).
  - High users saved **2.5×** more time per note.
  - **84% reported a positive experience.**
  - — [AMA](https://ama-assn.org/practice-management/digital-health/ai-scribes-save-15000-hours-and-restore-human-side-medicine); [Becker's](https://www.beckershospitalreview.com/healthcare-information-technology/ai/16k-hours-saved-ambient-ai-scribes-at-kaiser-permanente/)
- **Accuracy: UC Davis pragmatic pilot, JMIR Med Inform 2026.** 356 of 7,545 notes reviewed (31 clinicians).
  - **Omissions in 18%, hallucinations in 11.5%, accidental inclusions in 9.3%.**
  - 83.8% of errors were mild to moderate.
  - **5.3% of notes had errors posing serious or imminent risk.**
  - — [JMIR Med Inform 2026 e86474](https://medinform.jmir.org/2026/1/e86474); [eScholarship](https://escholarship.org/uc/item/9r89g3sp)
- **Frontiers in AI 2025.** Hallucinations in **31% of ambient AI notes vs 20% of physician "gold" notes** (P=0.01). — [Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1691499/abstract)
- **Mayo Clin Proc Digital Health 2025.** 5 commercial scribes tested on 14 simulated encounters. A **26.3% error rate** is cited by commentary only and was not verified against the paper. — [JMIR 2026 references](https://medinform.jmir.org/2026/1/e86474)

### Inferences
- Effects are real but modest (about 0.3–0.9 h/day or week ranges, about 10% time-in-note). Burnout effects appear larger than time effects, possibly through lower cognitive load.
- If voice or AI capture is added to a dental product, it should use draft-then-confirm UX with highlighted uncertain fields, because omissions dominate the errors.
- In a dental setting the structured odontogram is the core record. A scribe is most plausible for the free-text visit note.

### Gaps
- No peer-reviewed dental-specific ambient scribe or voice-charting outcome study was found (dental voice charting exists commercially, e.g., periodontal charting).
- No evidence on Uzbek or Russian language scribe accuracy was found.

## 6. Accessibility, readability, chairside tablets and infection control (gloves, voice, foot pedals)

### Takeaway
Evidence here is thin and mostly non-dental. Operatory keyboards and mice are documented contamination reservoirs that need barriers or disinfection. Gloved touch input is less accurate at the first attempt, and larger targets (about 10–15 mm) prevent wrong-button errors. No peer-reviewed dental study on foot pedals or voice charting outcomes was found.

### Cited Findings
- **Detroit Mercy dental student clinics.** **Persistent contamination of clinical keyboards** and variable infection-control compliance. A CaviWipes disinfectant protocol eliminated detectable bacteria. — [UDM archive](https://libraries.udmercy.edu/archives/achievement/index.php?sid=22698)
- **Teaching-hospital keyboard study.** Clinic keyboards acted as **reservoirs of potentially pathogenic organisms including S. aureus**. The URL is a proxy mirror. — [SAGE (mirror)](https://https-sage-cnpereading-com-443.webvpn1.xju.edu.cn/doi/10.1177/1757177410384892)
- **Gerba et al. 2016, J Dent Hyg 90(6):354.** Dental-office fomites, including total coliforms, E. coli and MRSA, were reduced to below detection with a hydrogen-peroxide wipe intervention. — [JDH PDF](https://jdh.adha.org/content/90/6/354.full.pdf)
- **Dental infection-control guidance.** Keyboard and mouse must be **barrier-protected or cleaned and disinfected**, and CDC accepts clear plastic barriers. — [Dimensions of Dental Hygiene](https://dimensionsofdentalhygiene.com/article/contaminated-surfaces/); [RDH magazine](https://www.rdhmag.com/infection-control/personal-protective-equipment/article/16405887/computer-keyboards-in-the-dental-setting)
- **Gloved touch study (military context, n=6).**
  - Gloves **reduced first-attempt accuracy**.
  - **No wrong-button errors with MIL-STD-1472 sizing (≥15 mm square touch zone, 3 mm separation)**, gloved or not.
  - Small sample.
  - — [Touch Zone Sizing for Mobile Devices in Military Applications](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi...........9465c900e5780072de7a168d106fd14d)
- **General touch-target sizing.** NN/g cites Parhi, Karlson & Bederson's **minimum of about 1 cm × 1 cm** for fast, accurate touch. Apple's HIG specifies **44 × 44 pt**. Other studies give 10.5–26 mm depending on conditions. — [NN/g Touch target size](https://www.nngroup.com/articles/touch-target-size/)
- **Older trade article, "Why won't some dentists use chairside computers" (2007).** Gives context on chairside adoption barriers. — [Orthodontic Products](https://orthodonticproductsonline.com/clinical-tips/why-wont-some-dentists-use-chairside-computers-2007-04-09-05/)

### Inferences
- For chairside or tablet modes, use touch targets of at least about 10 mm (≥44 px) and preferably about 15 mm for gloved use, with spacing between targets.
- Minimize keyboard entry during treatment. Prefer large-tap odontogram and status buttons, and an assistant-driven entry mode (assistant charts while the dentist dictates).
- Design for barrier-wrapped hardware: no reliance on fine hover states or tiny icons.

### Gaps
- No peer-reviewed study was found on nitrile or latex gloves with capacitive tablets in dentistry.
- No outcome evidence was found on foot-pedal or voice control for dental charting.
- No clinical-UI-specific font-size or contrast study was found. WCAG 2.x AA (4.5:1 contrast) applies as the generic standard; it was not fetched this session.

## 7. Design standards and guidance (NIST, ONC, ISO, AHRQ)

### Takeaway
NISTIR 7804 (2012) is the main EHR-specific usability protocol: expert review plus validation testing focused on critical, safety-relevant tasks. US ONC certification criterion 170.315(g)(3), "Safety-enhanced design", requires vendors to document user-centered design and summative usability testing, and vendor reports typically follow NISTIR 7742 / 7804.

### Cited Findings
- **NISTIR 7804, "Technical Evaluation, Testing and Validation of the Usability of Electronic Health Records" (Lowry et al., NIST, 2012).** Its EHR Usability Protocol (EUP) has two parts: **expert review** of the interface against user-interface design principles, and **validation testing with representative users** on critical tasks. The aim is to find and address **critical use errors before deployment**. — [NIST PDF](https://nvlpubs.nist.gov/nistpubs/ir/2012/NIST.IR.7804.pdf); [NIST document page](https://www.nist.gov/document/nistir-7804pdf)
- **ONC 45 CFR 170.315(g)(3) Safety-Enhanced Design.** Vendor certification test reports are prepared under this criterion and commonly use the **NISTIR 7742 Common Industry Format** for summative tests, for example the Phoenix EHR and escribeHOST 2026 reports. — [Provation SED report](https://www.provationmedical.com/wp-content/uploads/2020/09/170.315.G.3–SAFETY-ENHANCED-DESIGN-R2.pdf); [escribeHOST SED report 2025/2026](https://slicompliance.com/wp-content/uploads/2026/01/escribeHOST-7-SED-Report_v12312025.pdf)
- **AHRQ-funded work on evidence-based user-centered design and implementation guidelines for EHRs** exists. Specific recommendations were not retrieved. — [AHRQ digital](https://digital.ahrq.gov/ahrq-funded-projects/developing-evidence-based-user-centered-design-and-implementation-guidelines/citation/ehr-usability)

### Inferences
- A lightweight NISTIR 7804-style process suits a solo or small team:
  1. Define 5–10 critical dental tasks (e.g., record allergy, chart a restoration on the correct tooth and surface, prescribe, take payment, schedule).
  2. Run heuristic review plus summative tests with real clinic staff per role, measuring success rate, time, errors and SUS.
- Wrong-tooth or wrong-surface charting and medical-alert visibility are natural candidates for "critical safety tasks".

### Gaps
- NISTIR 7804-1 (the 2015 addendum on usability of EHR use errors and safety) and NISTIR 7865 (wrong-patient errors) were not retrieved.
- The exact ONC (g)(3) list of required safety-related tasks and the recommended minimum participants (often cited as 10 per user group) could not be verified in this session. Treat these as unverified.
- **ISO 9241-210** (human-centred design for interactive systems) was not retrieved. Its general principles are user-centred iteration, evaluation with users, and understanding the context of use. Treat this as background knowledge, not a cited finding.
