# Paper Design — Yōkai Operation as Designable Experience

**Target venue**: SIGGRAPH Asia 2026 Art Papers
**Status**: Architectural plan for rewrite of [siggraph_art_paper_draft.tex](siggraph_art_paper_draft.tex)
**Companion docs**: [results_writeup.md](results_writeup.md) (data), [narrative_strategy.md](narrative_strategy.md) (frame, partially superseded by this doc)
**Scope**: Generative AI / participatory layer only. The archive-analysis layer (geo-mapping, bias diagnosis, contrastive retrieval) is treated as methodological prerequisite, not paper content.

---

## 0. The single thesis

> **妖怪は object ではなく operation である**：不可解な経験を文化的語彙のなかに位置づける一連の認知-社会操作のことである。この operation は商業キャラクター産業の興隆とともに displaced され、今日では実行されることが稀になっている。**本論文は、generative AI を intermediate representation device として scaffolding することで、この operation を個人が experiential timeframe 内に実行可能にし、それによって operation 自体を operational に記述する。**研究の貢献は AI が何を生成したかではなく、operation が何を実行したかにある。

This thesis governs every section. Each section must either (a) establish the operation, (b) describe how the system scaffolds it, (c) report what the operation produced, or (d) reflect on what the operation revealed.

---

## 1. Three contributions (must be named explicitly in §1 and §6)

### Contribution 1 — Conceptual (the operation framework)

**Yōkai-naming is an operation, not an object class.** The operation has structural phases: articulation of inexplicable experience → connection to cultural precedents → naming → narrativization → visualization → social circulation. This framework re-reads Komatsu, Yanagita, Kagawa, and Hatanaka as accounts of the same operation from different angles, and proposes that yōkai studies be extended from *retrospective corpus analysis* to *operational process analysis*.

**Why this is a contribution**: The yōkai-as-cultural-device claim has existed since Komatsu, but the operation has never been described operationally — that is, in terms that could be implemented, scaffolded, or observed in execution. This paper provides that operational description.

### Contribution 2 — Empirical (operation-record as research object)

**The research object is not the generated yōkai; it is the record of the operation being performed.** Across 79 sessions, we document: (a) whether the operation functioned (66.7% pre→post categorical shift; psychology emerges as 50% post-dominant; 100% of character-entrants depart from character framing); (b) what the operation produced when existing vocabulary was insufficient (the 5-yōkai contemporary-anxiety cluster); (c) where the operation failed or where visitors overrode the AI (mode collapse around ソコ-cluster names; ~30% image-style leakage; visitor critiques of system limits).

**Why this is a contribution**: First systematic record of folk-operation execution under generative AI substrate. The 5-yōkai contemporary-anxiety cluster is empirical evidence that the operation extends to contemporary content — not preservation, but live cultural production.

### Contribution 3 — Methodological/Design (Folkloric Operation Probe)

**A portable design pattern**: open elicitation → heritage-corpus retrieval → constrained candidate generation (name, narrative, image) → visitor override at every stage → ephemeral materialization. The pattern is portable to other displaced folk operations (Welsh fairy lore, Slavic *domovoi*, Mexican *alebrijes*, Inuit story-traditions). Crucially, the pattern is defined not by what it generates but by **what it makes overrideable**: every AI proposal is intermediate representation, modifiable by the participant.

**Why this is a contribution**: Existing AI+heritage work either preserves (digital archive) or generates (LLM as oracle). This pattern occupies a third position: AI as **scaffold for the participant to perform the folk operation themselves**.

---

## 2. What is being redefined (the redefinition claim)

The current draft says "we recover a displaced practice." That is preservation rhetoric. Under the new design:

> **What is redefined is not what yōkai *are*, but what yōkai-cognition *does*. Yōkai-cognition is a continuing operation that society uses to absorb the inexplicable. What it absorbs reflects the substrate's conditions. Edo-period substrates absorbed encounters with roads, weather, and waterways. The contemporary substrate, demonstrated here, absorbs encounters with labor that does not end, photographs whose faces dissolve, infrastructure that fails. This is not preservation of yōkai. This is operation of yōkai under contemporary conditions.**

This claim is explicit, falsifiable (someone could argue the operation is *not* what we describe), and generalizes beyond yōkai. It is the kind of redefinition Art Papers reviewers reward.

---

## 3. Title and abstract

### 3.1 Title

**Primary recommendation**:

> **"Performing Yōkai: Generative AI as Scaffold for a Displaced Folk Operation"**

This title:
- Foregrounds the operation (Performing, not Generating)
- Names the AI position (Scaffold, not Creator)
- States the diagnosis (Displaced, not Lost)
- Generalizes (Folk Operation, not just Yōkai)
- Is 9 words — short enough to remember

**Alternatives** in case of taste:
- "What the Substrate Names: Performing Yōkai Folk Cognition with Generative AI"
- "The Naming Loop: Designing a Folk Operation under Generative AI"
- "Yōkai as Operation: Scaffolding a Displaced Folk Cognition"

### 3.2 Abstract (full draft, ~250 words)

> Komatsu Kazuhiko, Yanagita Kunio, and Kagawa Masanobu have argued — from different angles — that the Japanese folk practice of yōkai naming is not the production of supernatural entities but the execution of a cognitive operation: receiving an inexplicable experience, connecting it to cultural precedent, giving it a name and a narrative, rendering it as image, and circulating it in a community. We refer to this as **yōkai-cognition**. The operation has been displaced by the commercial-character industry, in which yōkai are encountered as finished entities to be consumed rather than as the output of a practice to be performed.
>
> This paper documents an exhibition system that scaffolds yōkai-cognition as an executable individual experience. A visitor articulates an unexplained event from their own life; the system retrieves thematically related precedents from over 35,000 historically documented yōkai; a language model proposes three folkloric naming candidates; an image model proposes a visual depiction constrained to traditional Japanese styles; a thermal printer materializes the result on paper that fades within months. At every stage, the AI's proposal is intermediate representation: modifiable, refusable, traceable.
>
> Across 79 sessions deployed between February and May 2026, the operation functioned for 67% of paired pre-post respondents, with the *psychology* framing (yōkai as a name given to inarticulate experience) emerging as the dominant post-experience category (50%). All seven visitors entering with a commercial-character framing departed from it. Most strikingly, five generated yōkai have no Edo-period precedent: they name overtime that multiplies through the night, factory dusk-shadows that strip faces from photographs, event-venue presences that drain warmth at the moment of power failure. We contribute (1) an operational framework that re-reads yōkai studies as describing a single cognitive operation, (2) the first systematic record of that operation being executed under generative AI substrate, and (3) the *Folkloric Operation Probe* — a reusable design pattern for scaffolding displaced folk operations.

---

## 4. Section-by-section architecture

### §1 Introduction — "From entity to operation"

**Purpose**: Establish the operation thesis before any system description. Set the redefinition stakes.

**Arc** (4 paragraphs):

1. **Open with the operation**: A villager in pre-modern Japan hears unexplained footsteps on a road at dusk. They name the experience "Betobetosan," attribute behavioral rules to it ("address it aloud and the sensation subsides"), and transmit the name. This is not the production of a supernatural entity. This is the execution of a cognitive-social operation: articulation → precedent-matching → naming → narrativization → circulation. Komatsu has called this "the cultural device of yōkai." Yanagita's classification was organized by the *phenomenon* that triggered the operation, not by the *entity* that resulted. We refer to the operation as **yōkai-cognition**.

2. **The displacement**: In contemporary Japan, yōkai are encountered primarily as commercial-character intellectual property — *Yo-kai Watch*, *GeGeGe no Kitarō*. These are not the failure of folk culture; they are its continuation under capitalist substrate conditions, in which yōkai-cognition is performed by industry on behalf of consumers who receive its outputs rather than execute the operation themselves. The operation has not died; the conditions for an individual to execute it have eroded.

3. **The research question**: We ask whether yōkai-cognition can be re-instantiated as an individual, AI-scaffolded experience within an experiential timeframe of three to five minutes — and if so, what it produces. The position we develop differs from the dominant frames in contemporary discourse on generative AI in art (AI as tool, as collaborator, as autonomous agent, as object of critique). We propose AI as **intermediate representation device**: every output is a modifiable, refusable, traceable proposal that the participant takes up, edits, or rejects in the course of performing the operation themselves.

4. **What follows**: §2 situates the work in yōkai studies, generative-AI art discourse, and folk-medium theory. §3 describes the operation theoretically and the system as its scaffold. §4 reports what the operation did across 79 sessions. §5 reflects on what the records reveal — about contemporary anxiety, about the AI position, and about the limits of the authors' authority over a folk practice they are not bearers of.

**What NOT to include in §1**:
- The "weaving" metaphor (drop)
- "Recovering" / "preservation" language (replace with "executing" / "scaffolding")
- Long Komatsu summary (compress to operation-relevant claims)
- Citations of commercial titles in defensive tone (state the displacement, do not litigate it)

### §2 Related Work — three streams

**Three subsections, each 1–2 paragraphs**:

**§2.1 Yōkai studies as operation theory.** Read Komatsu, Yanagita, Kagawa, and Hatanaka as overlapping accounts of the same operation. Cite Foster (*Pandemonium and Parade*, 2009) as the English-language anchor for international readers. The novel claim: existing yōkai studies has the operation theory but has not described it operationally — that is, in implementable terms. Our paper performs that operationalization.

**§2.2 Generative AI in art: positioning the fifth role.** Locate the contribution in the existing AI-art typology: AI as tool, as collaborator (Sougwen Chung's *Drawing Operations*, Holly Herndon's *Spawn*), as autonomous agent (Ian Cheng's *Emissaries*), as object of critique (Crawford & Paglen, "Excavating AI"; Bender et al., "Stochastic Parrots"; Steyerl, "Mean Images"). Propose a fifth role: **AI as intermediate representation device** — neither author nor collaborator nor agent, but a producer of refusable proposals through which a human performs a cultural practice. Cite Crawford's *Atlas of AI* for the materiality argument. Cite Ozawa et al. (SIGGRAPH Asia 2024) as the precedent for "AI output gaining cultural weight through material process" — and distinguish: their question is whether AI output can acquire aura; ours is whether AI scaffolding can host a folk operation.

**§2.3 Computational folkloristics and cultural probes.** Cite Tangherlini's computational folkloristics (descriptive corpus analysis) and distinguish: we extend from describing folk corpora to scaffolding folk operations. Cite Gaver, Dunne & Pacenti's "Cultural Probes" (1999) as methodological ancestor of the **Folkloric Operation Probe**, and Dunne & Raby (*Speculative Everything*, 2013) for speculative design lineage. Cite UNESCO 2003 Intangible Heritage Convention for the practice-over-artifact principle. Distinguish from preservation-oriented digital-heritage work: we are not preserving the operation as artifact; we are making it executable.

**What NOT to include in §2**:
- Generic AI-and-creativity surveys (focus on positioning)
- Yōkai cultural history beyond operation theory (cite Foster once, do not summarize)
- Wide HCI literature on participatory installations (cite Benford only if necessary)

### §3 The Operation and Its Scaffold

**Restructure the current §3 around operation phases, not system components.**

**§3.1 The operation, formally.** State the five phases:
1. **Articulation**: An inexplicable experience is rendered into language.
2. **Precedent-matching**: The articulation is connected to cultural precedents that share thematic or phenomenological structure.
3. **Naming**: A new name is proposed, following typological conventions (phenomenon-descriptive, place-conditional, sensory-onomatopoeic — Yanagita's three types).
4. **Narrativization and visualization**: A short narrative and visual depiction are produced, following genre conventions.
5. **Materialization and circulation**: The result is given a physical form that can be carried, shown, and eventually lost.

This is the operation in pre-industrial conditions, where each phase was performed by a participant embedded in oral community. Our system asks whether each phase can be scaffolded — not replaced — by computational mediation.

**§3.2 Phase 1 scaffold — Open elicitation.** Free-text input fields. No predefined categories. Critical: the system must accept articulation in the visitor's own words and carry those words into every subsequent phase. (Describe the actual UI briefly.) The operation's first phase requires that the participant articulate the inexplicable; the system's role is to provide a non-judgmental container, not to interpret.

**§3.3 Phase 2 scaffold — Folklore-grounded retrieval.** Embed the elicitation via Gemini Embedding (gemini-embedding-001, 768 dim); cosine-match against pre-computed embeddings of 35,000+ Nichibunken entries; retrieve top 5. Brief justification of retrieval depth (5 found through pilot to balance grounding and coherence). The retrieved precedents are presented to the language model as context, **not** to the participant; the participant sees their influence in the next-phase proposals, not as a raw list.

**§3.4 Phase 3 scaffold — Naming candidates.** Gemini 2.0 Flash generates three naming candidates per session, structured to follow Yanagita's three typological forms. The visitor selects one candidate or supplies their own name. We treat the choice as **interaction record**: which candidate was selected, whether the visitor overrode the system, and what the override was. *Of the 35 yōkai generated at YOKAI EXPO and continuing deployments, 33 were named from system candidates and 2 were named by the visitor* — but more importantly, the typological distribution of accepted names matches Yanagita's three forms without explicit prompting.

**§3.5 Phase 4 scaffold — Visualization.** Gemini 2.5 Flash Image generates an image constrained to one of three Japanese traditional styles (ink wash, woodblock, illustrated scroll). Negative constraints suppress photorealistic, anime, and commercial-mascot aesthetics. **Honestly acknowledge**: the constraints are soft priors. In a sample of six inspected images, approximately one-third exhibited leakage into contemporary horror-manga register. We retain the failures as part of the practice-based record; they are evidence of the scaffold's limits.

**§3.6 Phase 5 scaffold — Ephemeral materialization.** 80mm thermal print on receipt paper. Ink degrades under ambient conditions; readability decays over months. This is the substrate-level commitment that distinguishes our position from the preservation paradigm: the materialization is designed to **fail at the temporal scale of folk transmission**, not to outlast it. (Cite Steyerl, "In Defense of the Poor Image," for the anti-archive argument; cite SFPC's "Emergence and Decay of Computation" for the ephemeral-computation precedent.)

**§3.7 Anti-blackbox commitment.** State explicitly: at each phase, the AI's contribution is intermediate representation. Retrieved precedents are queryable; naming candidates are visible and refusable; image generation is constrained and the constraints are visible; the print is the end of a chain, not the output of an oracle. The system does not claim to do yōkai-cognition for the participant; it scaffolds the participant's own execution of the operation. This commitment is what distinguishes "AI as intermediate representation device" from "AI as creator."

**§3.8 Acknowledgment of the first layer (prerequisite).** Briefly acknowledge that the system rests on archival analysis of the Nichibunken corpus (bias diagnosis, geographic distribution, multi-axis retrieval). This first layer is the subject of a separate paper (in preparation for *Information Processing and Management*); here, it functions as methodological prerequisite. (One paragraph, no more.)

### §4 Deployment and Operation Records

**Restructure as three records, not four observations.**

**§4.1 Context and population.** Deployed at YOKAI EXPO 2026 (Shōdoshima, February) and subsequent sites through May 2026. 79 sessions initiated; 56 print-triggered; 47 receipts produced; 66 complete yōkai records (name + narrative + image) in database; 37 post-surveys completed (53.6% post-completion rate). Population: predominantly general audience (n=42), other (n=11), exhibition/creative professionals (n=8), yōkai enthusiasts (n=7), researchers/educators (n=4). Pre-familiarity mean 3.26 / 5.0, pre-AI-experience mean 3.51 / 5.0.

**§4.2 Record I — The operation functioned.** Among 36 paired pre-post respondents:
- 24 (67%) shifted their categorical framing of yōkai.
- 18 (50%) ended in the *psychology* category (yōkai as a name given to inarticulate experience).
- All 7 visitors entering with *character* (commercial-media) framing departed from it; 5 of 7 moved to *psychology*.
- Behavioral intention to investigate folklore after the experience: mean 3.51/5, with 57% scoring ≥4.

Frame this as: *the operation functioned for the majority; psychology emerged as the dominant post-state, mapping precisely onto Komatsu's account of yōkai as cognitive operation; the cleanest evidence of functioning is the 100% character-departure rate.*

**§4.3 Record II — What the operation produced.** The 5-yōkai contemporary-anxiety cluster:
- *Zōshoku-zangyō* ("Multiplying Overtime")
- *Kenshū-fujun* ("Inspection Irregularity")
- *Dandenhōkō* ("Power-Outage Wandering")
- *Kōjō-yūei* ("Factory Dusk-Shadow")
- *Tōri-tsuki* ("Passing Moon")

Each yōkai presented with: visitor input context, generated narrative (translated), and image. Frame as: *these entities have no Edo-period precedent. The historical corpus, focused on roads, weather, and waterways, did not produce them. The operation, performed under contemporary substrate conditions, produced them. They are evidence that the operation is generative, not preservative.*

Then make the theoretical move: read all five through **Mark Fisher's distinction of the weird and the eerie** (Fisher 2016, *The Weird and the Eerie*). All five exhibit eerie structure — failure of presence (faces missing from photographs, power absent in venue) or failure of absence (overtime that should end but does not, audit irregularity that should resolve but persists). Yōkai-cognition is, on this reading, a folk technology for handling Fisher's eerie. The historical corpus shows what eeriness the pre-industrial world contained; this cluster shows what eeriness the late-capitalist workplace contains.

**§4.4 Record III — Where the operation strained.** Three documented failures:
- **Mode collapse in naming.** 14/66 (21%) names cluster around prefixes encoding existential-locative uncertainty (ソコハ-, ソコカ-, ソレガ-, コッチ-). This is either (a) generative-model mode collapse around a high-probability semantic ridge, or (b) evidence that contemporary unease is structured specifically around *uncertainty of presence's locus*. Acknowledge both readings.
- **Style constraint leakage.** ~30% of inspected images leaked into contemporary horror-manga register. We did not filter these out. They are part of the record.
- **Visitor critiques.** Quote one visitor's critique directly: "*素粒子が宇宙からきているという宇宙線の概念をきちんと絵として生成出来ているのがとても印象的でした．しかし，アハ体験はアハっとなる必要があるので，アハ的な画像は生成されていなかった．*" (Translation: the system handles concrete imagery well but cannot visualize the structure of an experiential moment.) This visitor articulated a limitation we had not anticipated.

Frame as: *failure points are not bugs to suppress; they are where the operation strained against the substrate's affordances, and that strain is itself research data.*

**§4.5 Record IV — Visitor articulations of the operation.** Quote-led structure with 6–8 gold quotes. The selection should foreground visitors who described the operation in terms close to Komatsu's:
- "*人の認識や疑問を具象化して、受容するための作品*" (concretizing and accepting human perceptions and questions)
- "*AIの力で何となく怖いと感じていた現象を実体化できた事*" (giving material form to phenomena vaguely sensed as frightening)
- "*妖怪にすることで、人の思う不思議を可視化する*" (by making it yōkai, the wonder a person feels becomes visible)
- "*自分の中にある不安やわからない感情を可視化する作品*" (visualizing anxiety and unknown emotions inside oneself)
- "*潜在意識の可視化*" (visualization of the subconscious)
- "*自分の経験から妖怪を生成でき、妖怪に親近感が湧いた*" (by generating yōkai from my own experience, yōkai came to feel familiar)
- "*妖怪存在の生成プロセスの追体験*" (re-experiencing the generative process of yōkai existence)

Frame as: *the visitors themselves articulated what we describe theoretically as yōkai-cognition. The operation was not imposed; it was recognized.*

**§4.6 Subgroup heterogeneity (brief).** Researchers/educators: 100% shift. General audience: 74%. Yōkai enthusiasts: 60%. Exhibition/creative professionals: 33%. Frame: *visitors with strongest pre-existing aesthetic-commercial frameworks are most resistant; visitors without specific commitments shift most readily. This pattern is consistent with the operation thesis — the operation is interpretive work, not aesthetic confirmation.*

**§4.7 The receipt as folk object.** Retain the brief ethnographic observation (visitors folding receipts and placing them in wallets). Add the visitor quote: "*絵をおみやげとしてもらえるところ*" (the fact that you get the picture as a souvenir). Frame: *the materialization phase was completed; the artifact entered the visitor's life as a personal object, occupying a register between art print and folk charm.*

### §5 Reflection

**Three distinct moves, in this order.**

**§5.1 The operation as continuing.** State the redefinition explicitly: yōkai are not entity-class but operation-output; the operation is substrate-dependent; what the operation produces reflects the substrate's conditions. The 5-yōkai contemporary cluster is the empirical content of this claim. Cite **Yuk Hui's cosmotechnics** (*The Question Concerning Technology in China*, 2016) for the framework that there is no universal Technology — only cosmotechnics, plural, each grounded in a specific cosmology. The yōkai-cognition operation is a cosmotechnic; our system attempts to hybridize it with the Western-technoscientific cosmotechnic of generative AI. The 5-yōkai cluster is what emerges at the hybridization point.

**§5.2 AI as intermediate representation device — the fifth position.** Develop the contribution to AI-in-art discourse. Existing positions are tool / collaborator / autonomous agent / object of critique. Our position is intermediate representation device: AI produces refusable, modifiable, traceable proposals through which a human performs a cultural practice. This is not a softening of the critique literature (Crawford, Bender, Steyerl); it is a structural response to it. The critique literature has shown that AI cannot be ethically positioned as creator. The intermediate representation framing accepts this and asks: *what role remains?* The answer this paper offers: scaffold for human-executed cultural practice.

**§5.3 Self-implication: who has the authority to redefine?** The authors of this paper are not bearers of regional folk practice. We are urban researchers and engineers. The yōkai-cognition operation we describe is a folk practice that has historically been performed by communities to which we do not belong. We acknowledge this position-asymmetry without resolving it. We do not claim "yōkai practice is X." We claim that under specific substrate conditions, with specific visitor populations, the operation we describe was executed, and the records of its execution exhibit the structure we describe. The theoretical readings we offer (Komatsu, Hui, Fisher) are open to revision by practitioner-bearers of the folk practice and by the regional cultural communities of Shōdoshima and beyond.

**§5.4 Limitations.** 
- The operation we record is individuated, not communal; the historical operation was performed by communities through retelling. Our scaffold collapses this into individual execution. We treat this as a substrate-specific mutation of the operation, not a failure to recover it.
- Population was self-selected for yōkai interest at YOKAI EXPO; subsequent deployments diversified the population but did not fully neutralize the bias.
- The thermal print's fade timescale (6–18 months under ambient conditions) is cited from manufacturer data; we have not performed longitudinal observation. A follow-up study could photograph receipts at intervals.
- No control condition (e.g., yōkai-selection from existing corpus vs. yōkai-generation from input) precludes causal claims about the scaffold's specific contribution.

### §6 Conclusion

**Three paragraphs**:

1. Restate the three contributions in their final form (conceptual / empirical / methodological).
2. Restate the redefinition: yōkai-cognition as continuing operation; what it produces reflects what the substrate carries.
3. Close on the single sentence: *We do not claim to have recovered a folk practice. We claim to have shown that the practice, when scaffolded as executable individual experience under generative AI substrate, produces yōkai indexed to the eeriness of the present — and that this is what folk practice has always done, under whatever substrate has carried it.*

---

## 5. Figure plan

| # | Slot | Content | Source / status |
|---|---|---|---|
| Teaser | §1 | Visitor receiving/folding a printed yōkai receipt at YOKAI EXPO | [paper/siggraph/figures/EXPO/](figures/EXPO/) — select 1 of 4 existing photos |
| Fig. 1 | §3.1 | The operation, formally: five-phase diagram (Articulation → Precedent-matching → Naming → Narrativization+Visualization → Materialization) | NEW — create as simple SVG/PDF, label each phase with both the folk-cognition function and the system scaffold |
| Fig. 2 | §3 | System architecture: the five scaffolds mapped onto the operation diagram, showing what is intermediate representation and what is participant decision | NEW — extend Fig. 1 with system components |
| Fig. 3 | §3.5 | Three successful style outputs (ink wash, woodblock, scroll): **チロリ**, **腹切夢**, **ソコハカニ** | [experiment/data/img_samples/](../../experiment/data/img_samples/) — already extracted |
| Fig. 4 | §3.6 | Thermal-print fade comparison: new vs. ~3-month-aged receipt of same yōkai | NEW — must be photographed; if not possible, citation-only with note |
| Fig. 5 | §4.2 | Pre→Post shift visualization: Sankey or heatmap, N=36, highlight character-departure flow | Generate from [data/surveys_raw.csv](../../experiment/data/surveys_raw.csv) |
| Fig. 6 | §4.3 | The contemporary-anxiety cluster: 5 yōkai in 2×3 grid (last cell can be the cluster's collective heatmap of eerie-structure mapping), each with name, visitor-input context, and image | NEW composite — extract images from CSV |

Figures 1 and 6 are conceptually new and indispensable. Figure 1 makes the operation thesis visible at a glance; Figure 6 makes the empirical contribution visible. If only two figures can be polished in time, polish these two.

---

## 6. Table plan

| # | Slot | Content |
|---|---|---|
| Table 1 | §4.2 | Forced-choice C1–C5 distribution, N=37, with category code (C1 character consumption, C2 tech focus, C3 cultural grounding, C4 anxiety externalization, C5 ephemerality) |
| Table 2 | §4.2 | Pre→Post shift cross-tab, N=36, diagonal bolded |
| Table 3 (new) | §4.3 | The 5-yōkai cluster: yōkai name | English gloss | core phenomenon | Fisher-eerie classification | visitor-input bridge |
| Table 4 (optional) | §4.6 | Subgroup shift rates by visitor type |

Table 3 is the new addition and corresponds to Figure 6.

---

## 7. Citation strategy

### Must-add (currently missing, critical for contribution legibility)

| Author/Work | Where cited | Why |
|---|---|---|
| **Yuk Hui, *The Question Concerning Technology in China*** (2016) | §5.1 | Cosmotechnics frame — the theoretical anchor for redefinition |
| **Mark Fisher, *The Weird and the Eerie*** (2016) | §4.3 | Eerie as the structural reading of the 5-yōkai cluster |
| **Crawford, *Atlas of AI*** (2021) | §2.2, §5.2 | Materiality of AI, supporting "intermediate representation device" framing |
| **Bender, Gebru et al., "Stochastic Parrots"** (FAccT 2021) | §2.2, §5.2 | The critique our position structurally responds to |
| **Steyerl, "In Defense of the Poor Image"** (e-flux 2009) | §3.6 | Anti-archive aesthetics, ephemeral materialization argument |
| **Steyerl, "Mean Images"** (NLR 2023) | §2.2 | Current critical-theory reference for AI image generation |
| **Sougwen Chung**, *Drawing Operations* | §2.2, §5.2 | Distinguish: AI as collaborator vs. AI as intermediate representation |
| **Ian Cheng**, *Emissaries* trilogy | §2.2, §5.2 | Distinguish: AI as autonomous agent vs. AI as scaffold |
| **Gaver, Dunne & Pacenti, "Cultural Probes"** (interactions 1999) | §2.3 | Methodological ancestor of Folkloric Operation Probe |
| **Tangherlini, computational folkloristics** (any of several papers) | §2.3 | Distinguish: corpus-descriptive vs. operation-scaffolding |
| **Foster, *Pandemonium and Parade*** (2009) | §1, §2.1 | English-language anchor for international reviewers |
| **2–3 recent SIGGRAPH Asia Art Papers (2023–25)** | §2.2 | Demonstrates engagement with the venue's conversation |

### Retain from current draft

Komatsu, Yanagita, Kagawa, Hatanaka, Mizuki, Sekien, Nichibunken, Ozawa et al., UNESCO, SFPC, Benford.

### Drop or de-emphasize

- *GeGeGe no Kitarō* and *Yo-kai Watch* franchise citations: keep but reduce to one citation each. Do not litigate.
- Touken-World ukiyo-e reference: drop (not load-bearing).
- Fordham yōkai exhibition: drop (not load-bearing).
- Cantonese porcelain AI paper: optional — cite only if §2.3 needs more cultural-heritage-AI precedent.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **"Just another AI+heritage paper"** | The operation framework and the 5-yōkai cluster are the two anti-genericness moves. Both must be visible by the end of the abstract. |
| **"Yōkai is too Japan-specific for international reviewers"** | Foster (2009) anchor; explicit Folkloric Operation Probe portability claim with non-Japanese examples; Hui's cosmotechnics framework explicitly addresses non-Western technique. |
| **"Surveys are small / methodology weak"** | Reframe the surveys as operation-record triangulation, not as causal-claim evidence. Headline the qualitative — gold quotes carry the argument better than the 67%. |
| **"AI-romanticization"** | §3.7 (anti-blackbox commitment) and §5.2 (response to Crawford/Bender) are the structural defenses. Keep them sharp. |
| **"Reviewers reject the contemporary-anxiety reading as cherry-picked"** | n=5 is sufficient for proof-of-existence (which is what we claim) but not for population estimate (which we do not claim). State this distinction in §4.3. |
| **"Mode collapse and style leakage discredit the system"** | §4.4 frames these as documented strain points, not bugs. The honesty itself is the argumentative move; do not soften it. |
| **"Authors lack authority over folk culture"** | §5.3 (self-implication) addresses this directly. Do not skip it. |
| **"Style constraints don't hold — the paper says traditional, the images show manga"** | Already addressed in §3.5 and §4.4 by stating ~30% leakage honestly. The acknowledgment converts a potential disqualifier into a documented limit. |

---

## 9. What the argument does in each section (the arc)

To verify the design's coherence, here is the operation thesis traced through every section:

- **§1**: Establishes that yōkai is operation, displaced; states the research question.
- **§2**: Positions the contribution in three discourses (yōkai studies, AI in art, computational folkloristics).
- **§3**: Defines the operation formally; describes the system as phase-by-phase scaffold; commits to anti-blackbox.
- **§4**: Reports the operation's records — functioning (Record I), producing (Record II), straining (Record III), articulating (Record IV).
- **§5**: Reflects on what the records reveal — operation is continuing (§5.1), AI's role is intermediate representation (§5.2), authors are not bearers (§5.3).
- **§6**: Restates contributions and the redefinition.

Each section advances the operation thesis. No section is decorative. If any section can be removed without weakening the thesis, it must be cut.

---

## 10. Single-sentence pitch (final)

> **We do not claim to recover a folk practice. We define yōkai-cognition as a five-phase operation; we scaffold its individual execution by treating generative AI as intermediate representation device; we report 79 sessions in which the operation functioned, produced contemporary-anxiety yōkai indexed to Fisher's eerie, and strained at specific predictable points — and we propose that this is what folk practice has always done, under whatever substrate currently carries it.**

If this sentence holds together without flinch, the paper is structurally sound.

---

## 11. Execution checklist

- [ ] Title finalized: "Performing Yōkai: Generative AI as Scaffold for a Displaced Folk Operation"
- [ ] Abstract drafted (§3.2 above) — paste into .tex
- [ ] §1 rewritten using the 4-paragraph arc
- [ ] §2 restructured into three subsections (yōkai, AI in art, computational folkloristics)
- [ ] §3 restructured around operation phases (§3.1–§3.7) plus prerequisite note (§3.8)
- [ ] §4 restructured into four records (Functioning / Producing / Straining / Articulating) plus subgroup and receipt subsections
- [ ] §5 restructured into three moves (Continuing / AI position / Self-implication) plus limitations
- [ ] §6 rewritten as three paragraphs closing on the single sentence
- [ ] Fig. 1 created (five-phase operation diagram)
- [ ] Fig. 6 composed (5-yōkai contemporary cluster grid)
- [ ] Fig. 3 finalized (three style outputs)
- [ ] Fig. 5 generated (Pre→Post Sankey/heatmap)
- [ ] Tables 1–3 updated with N=37 / N=36 numbers; Table 3 newly composed
- [ ] 10–12 new citations integrated (Hui, Fisher, Crawford, Bender, Steyerl ×2, Chung, Cheng, Gaver, Tangherlini, Foster, 2–3 SIGGRAPH Asia 2023–25)
- [ ] Self-implication paragraph drafted (§5.3) — this is the section most authors skip and most reviewers reward
- [ ] Thermal fade comparison photograph commissioned, or §3.6 amended to cite-only

---

## 12. Closing note

The redefinition this paper proposes is small but precise: **yōkai is not what but how**. Once that move is made, the rest of the paper falls into place — the system is a scaffold for the *how*, the data is a record of the *how* being executed, the reflection is on what the *how* reveals.

The paper's risk is not in its claims, which are defensible. The paper's risk is in *not making the claims sharply enough*. If the rewrite hedges any of the three contributions, the paper reverts to "another AI+heritage exhibition writeup." The design above is intended to leave no room for that reversion.
