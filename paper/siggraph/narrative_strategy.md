# Narrative Strategy — Toward a Redefinition of Yōkai Culture, and the Art/Design Contribution

**Purpose**: Move the paper from "preservation/recovery" framing → "redefinition + new role for AI in art" framing, in a way that maximizes contribution legibility for SIGGRAPH Asia Art Papers reviewers and connects to ongoing discourse in art, design, and media theory.

**Companion to**: [results_writeup.md](results_writeup.md). This document is about *how to frame the results*; that one is about *what the results are*.

---

## 1. The diagnosis: why the current narrative under-delivers

The current draft positions the work as **"recovering a displaced folk practice through generative AI"** (see Abstract and §1). This framing has three weaknesses:

| Weakness | Why it matters |
|---|---|
| **Preservationist tone** | "Recovery" implies the work's value is *restorative*. Art Papers reviewers reward redefinition and intervention over preservation. The work appears as cultural-heritage technology, not as art proposing a position. |
| **Yōkai-locked** | The contribution reads as "interesting for people who care about Japanese yōkai." International reviewers without that prior cannot port the contribution to their own concerns. |
| **AI position is asserted, not theorized** | "AI as temporal infrastructure" is stated but not connected to broader discourse on generative AI in art. The position floats. |

The data we now have — particularly the 5-yōkai contemporary anxiety cluster (see Finding 3 in [results_writeup.md](results_writeup.md)) — supports a far stronger framing. We are not recovering a practice; we are **documenting a new substrate in which the practice continues to operate, and producing the first empirical evidence of what it produces under that substrate.**

---

## 2. The recommended narrative: "After the Storyteller"

### 2.1 The Benjamin reframe

In *Der Erzähler* (1936), Walter Benjamin diagnosed the death of the storyteller as a cultural figure. The storyteller, for Benjamin, transmitted *Erfahrung* — experiential wisdom that could be passed across generations — through tellable narrative. The storyteller was displaced by two newer media:

- The **novel**, which privatized narrative (read alone, not retold)
- The **newspaper**, which delivered *information* (verifiable, immediate, disconnected from counsel)

Benjamin's loss was not nostalgia. It was a specific media-theoretic claim: as the storyteller dies, *Erfahrung* dies, replaced by *Erlebnis* (raw, unprocessed shock-experience).

**The yōkai naming practice is a precise instance of Benjamin's storyteller-function**:
- Individual experience of the inexplicable (Erfahrung-raw)
- Transmitted, retold, varied across communities
- Crystallizing into a named cultural form that future encounters can recognize themselves through
- Carrying behavioral counsel (how to live with this kind of experience)

And the yōkai practice was displaced by precisely the media Benjamin named:
- The novel-analog: **fictional literature about yōkai** (Edogawa Ranpo, Kyōka, modern horror fiction)
- The newspaper-analog: **commercial-character media** (Mizuki, *Yo-kai Watch*) — which deliver yōkai as *information* (verifiable, immediate, disconnected from the act of folk naming)

This is a much stronger frame than "the commercial industry replaced folk practice." It locates the loss inside a canonical art-theoretical lineage, and connects yōkai's contemporary condition to a wider 20th-century media-cultural diagnosis.

### 2.2 The thesis

> **Generative AI, when subordinated to a folk practice rather than positioned as creative agent, can function as a folk medium — re-activating Benjamin's storyteller-function within an experiential timeframe. The yōkai naming practice, displaced by the same forces Benjamin diagnosed, returns under this new substrate not as restoration but as adaptation: visitors generate yōkai that name the anxieties of the present (overtime, photographic distortion, event-venue power failures), demonstrating that the folk practice is generative beyond preservation.**

### 2.3 What "yōkai cultural redefinition" looks like under this narrative

| Era | Substrate | Yōkai's mode of existence |
|---|---|---|
| **Pre-modern** | Oral + manuscript | Place-bound regional folk practice; named through communal retelling |
| **Edo** | Woodblock print (Sekien) | Catalogued visual entities; the *Hyakki Yagyō* tradition |
| **Modern (Shōwa–Heisei)** | Mass media (Mizuki, Level-5) | Commercial-character iconography; consumption replaces practice |
| **Contemporary (Reiwa)** | **Generative AI + ephemeral print** | **Personal-experiential folklore; practice reactivated, individuated, contemporary in content** |

We are not preserving yōkai. We are documenting the emergence of a **fourth substrate** in which the practice continues, producing yōkai that index the anxieties native to contemporary life. This is the redefinition: **yōkai are not iconography; they are what the storyteller-function produces under whatever medium currently carries it.**

---

## 3. Three discrete contributions (each defendable separately)

The paper should foreground **three explicitly named contributions**. Reviewers look for and reward this kind of structural clarity.

### Contribution 1 — Conceptual: a new role for generative AI in the art-discourse typology

The current discourse on generative AI in art organizes positions roughly as:

- **AI as tool** (assistive, instrumental — e.g., Photoshop's generative fill)
- **AI as collaborator / co-author** (Sougwen Chung's *Drawing Operations*, Holly Herndon's *Spawn*, the "entangled agencies" discourse)
- **AI as autonomous agent** (Ian Cheng's *Emissaries* trilogy, simulation-art)
- **AI as object of critique** (Crawford & Paglen *Excavating AI*; Bender et al *Stochastic Parrots*; Steyerl *Mean Images*)

We propose a fifth position:

- **AI as folk medium / folk infrastructure** — a substrate that, like oral transmission, woodblock print, or mass media before it, carries and mutates a pre-existing cultural practice. The AI is neither author nor collaborator nor autonomous; it is the medium-conditions under which a practice continues to operate.

This position has implications:

- It treats AI's *stochasticity* — usually critiqued as unreliability — as a feature that maps onto **folk variation** (the same way no two oral retellings of a tale are identical)
- It treats AI's *training data dependence* — usually critiqued as theft — as analogous to a tradition's **collective compositional substrate** (when subordinated to a *specific* heritage corpus, not the open web)
- It reframes the ethical question from "should AI make art?" to "to which cultural practices can AI be subordinated, and what mutates when it carries them?"

This is the strongest single contribution, because it generalizes far beyond yōkai.

### Contribution 2 — Empirical: the first documented evidence of contemporary-anxiety yōkai

The 5-yōkai cluster (*Zōshoku-zangyō*, *Kenshū-fujun*, *Dandenhōkō*, *Kōjō-yūei*, *Tōri-tsuki* — see [results_writeup.md §1 Finding 3](results_writeup.md)) is **the first systematically generated and documented set of yōkai that name post-industrial anxieties**. The historical corpus contains yōkai of roads, weather, and waterways. This cluster contains yōkai of work hours, photographic distortion, and intrusive social cognition.

This is an empirical first. It expands yōkai studies — a field that has historically operated retrospectively on a fixed corpus — into a generative mode. It demonstrates that **what counts as yōkai content is medium-dependent, not era-fixed.**

For art/design papers, this is the kind of empirical contribution that anchors the conceptual claim. Without it, "AI as folk medium" is a theoretical position; with it, it is a position supported by what the medium actually produced.

### Contribution 3 — Methodological: the Folkloric Cultural Probe as a reusable design pattern

The system architecture — open-ended elicitation → heritage-database retrieval → constrained naming → constrained visualization → ephemeral materialization — generalizes as a **design pattern for designing folk-practice instruments**:

> **Folkloric Cultural Probe** (FCP):
> 1. **Open elicitation**: Invite the participant to articulate an experience that resists existing categories
> 2. **Heritage-grounded retrieval**: Match the elicitation against a corpus of historically documented entries of the relevant folk practice
> 3. **Constrained generation**: Produce a new entry that follows the practice's structural conventions (naming, narrative, visualization), conditioned on the retrieved precedents
> 4. **Ephemeral materialization**: Output the result on a medium that decays at the timescale of folk transmission (months, not centuries)
> 5. **Document the corpus**: Collected outputs form an empirical record of contemporary cultural categories

This pattern is portable. The same architecture, with different heritage corpora, could generate:

- Welsh *Tylwyth Teg* (fairy lore) from contemporary Welsh-speaker anxieties
- Slavic *domovoi* (household spirits) from contemporary domestic experience
- Mexican *alebrijes* (composite creatures) from contemporary urban encounters
- Inuit *Inuk* story-traditions from contemporary Arctic-life experience

Each instantiation would simultaneously: (a) give participants a structured encounter with a displaced practice, and (b) produce an empirical archive of contemporary anxieties indexed through that practice's structural conventions.

This is the design contribution that lets practitioners outside the yōkai domain take something from the paper.

---

## 4. Discourse the paper should engage (citations to add)

The current draft cites primarily folklorists. To make a credible art/design contribution, the paper must engage these conversations:

### 4.1 Generative AI in art (current Art Papers / critical-theory canon)

| Author/Work | What to cite for |
|---|---|
| **Crawford, *Atlas of AI*** (Yale UP 2021) | The materiality of AI as infrastructure (supports "folk medium" framing) |
| **Crawford & Paglen, "Excavating AI"** (2019) | Training-data critique — position our subordination-to-specific-corpus as a response |
| **Bender, Gebru et al, "Stochastic Parrots"** (FAccT 2021) | Stochasticity critique — reframe as folk variation |
| **Steyerl, "Mean Images"** (New Left Review 2023) | AI image generation as poor-images-2.0; ephemerality discourse |
| **Hertzmann, "Can Computers Create Art?"** (Arts 2018) | The agency/tool debate that we sidestep |
| **Sougwen Chung**, *Drawing Operations* | Canonical "AI as collaborator" — distinguish our position from this |
| **Ian Cheng**, *Emissaries* trilogy | Canonical "AI as autonomous agent" — distinguish our position from this |
| **Memo Akten**, *Learning to See* | Perceptual AI art — engage briefly |
| **Holly Herndon, *Spawn*** | AI as voice-medium / cultural-substrate — closest precedent for our framing |
| **Refik Anadol** + the Marcus critique | Data-as-spectacle vs. data-as-folk-substrate distinction |

### 4.2 Media theory (the Benjamin lineage)

| Author/Work | What to cite for |
|---|---|
| **Walter Benjamin, "The Storyteller"** (1936) | **Central frame** — Erfahrung/Erlebnis, displacement of folk transmission |
| **Walter Benjamin, "The Work of Art in the Age of Mechanical Reproduction"** (1935) | Aura discussion — connect to Ozawa et al 2024 SIGGRAPH paper |
| **Marshall McLuhan, *Understanding Media*** (1964) | "Medium is the message" — supports periodization argument |
| **Friedrich Kittler, *Discourse Networks 1800/1900*** (1985) | Medium-historical periodization (Edo → Mass-media → AI substrate) |
| **Walter Ong, *Orality and Literacy*** (1982) | Folk transmission's structural properties |

### 4.3 Folk practice, intangible heritage, and design

| Author/Work | What to cite for |
|---|---|
| **UNESCO 2003 Convention on Intangible Cultural Heritage** (already cited) | Practice-over-artifact framing |
| **Foster, *Pandemonium and Parade*** (2009) | English-language yōkai cultural history — essential for international reviewers |
| **Tangherlini, "Trolls and Bridges: Computational Folkloristics"** | Computational folkloristics precedent — distinguish: they describe corpora, we re-perform practices |
| **Gaver, Dunne & Pacenti, "Cultural Probes"** (interactions 1999) | Methodological ancestor of our Folkloric Cultural Probe |
| **Dunne & Raby, *Speculative Everything*** (MIT 2013) | Speculative-design lineage — our work is "speculative folkloristics" |
| **Bardzell & Bardzell, "What is Critical About Critical Design"** (CHI 2013) | Position our work in critical-design tradition |

### 4.4 Ephemerality, anti-monumentality

| Author/Work | What to cite for |
|---|---|
| **SFPC, "Emergence and Decay of Computation"** (already cited) | Ephemeral computation as art |
| **Felix Gonzalez-Torres**, *Untitled (Portrait of Ross in L.A.)* | Anti-monumentality — candy-spill as ephemeral folk-form |
| **Andy Goldsworthy**'s ephemeral works | Material decay as artistic stance |
| **Hito Steyerl, "In Defense of the Poor Image"** (e-flux 2009) | Anti-archive aesthetics — connects to thermal-print fade argument |

The Steyerl piece is especially valuable: it argues that low-quality, degraded, circulated images carry political and cultural force precisely *because* they refuse the archive's permanence. Our thermal receipts are a material-print parallel.

### 4.5 Recent SIGGRAPH Asia / SIGGRAPH Art Papers (2023–2025)

The paper currently cites only Ozawa et al 2024. Reviewers will expect engagement with at least 2–3 more. Check recent Art Papers proceedings for work on:

- Generative AI + cultural heritage
- Ephemeral or decay-based artistic computation
- Interactive installations producing personal cultural artifacts
- Asian folk-practice and digital reactivation

(I cannot pull specific recent papers without web access; you should select 2–3 directly relevant ones from the ACM Digital Library.)

---

## 5. Title and abstract candidates under the Benjamin frame

### 5.1 Title options

In order of recommendation (strongest first):

1. **"After the Storyteller: Generative AI as Folk Medium for the Naming of Yōkai"**
   *(Benjamin reference up front, generalizable beyond yōkai, "folk medium" claim explicit)*

2. **"Naming the Inexplicable: Yōkai Folk Practice in a Fourth Medium"**
   *(Periodization argument up front, evocative but less specific)*

3. **"Yōkai as Folk Medium: A Practice Returns Under Generative AI"**
   *(Compact, claim-forward, slightly less hooked to canonical lineage)*

4. **"What the Substrate Names: Reactivating a Folk Practice with Constrained Generative AI"**
   *(Methodologically descriptive; weaker hook)*

The current title — *"Weaving Yōkai: Recovering Folk Naming Practice through Constrained Generative AI and Ephemeral Materialization"* — has four conceptual moves (weave / recover / constrain / ephemeral). Reviewers reward titles with one clear move. Choose one.

### 5.2 Abstract skeleton (Benjamin-framed)

> Walter Benjamin's 1936 essay diagnosed the displacement of the storyteller — the folk figure who transmitted experiential counsel through tellable narrative — by the novel and the newspaper. The Japanese folk practice of yōkai naming, by which communities turned inexplicable individual experience into shared cultural categories, exhibits Benjamin's storyteller-function precisely; and it has undergone an analogous displacement, surviving today primarily as commercial-character iconography. This paper documents an exhibition system that proposes a fifth position in the contemporary discourse on generative AI in art: **AI as folk medium**, neither tool nor collaborator nor autonomous agent, but a substrate that — when subordinated to a specific folk practice — carries and mutates it as oral transmission and woodblock print did before. Visitors articulate a personal experience of unease; the system retrieves thematically related precedents from over 35,000 historically documented yōkai, generates a name and narrative following folkloric conventions, produces an image constrained to traditional art styles, and prints the result on thermal paper that fades within months. Deployed across multiple sites between February and May 2026, the system engaged 79 visitors and generated 66 yōkai. Sixty-seven percent of paired pre–post survey respondents shifted their categorical framing of yōkai, with the *psychology* category — yōkai as a name given to inarticulate experience — emerging as the dominant post-experience framing (50%). Most strikingly, the generated corpus included a small cluster of yōkai that name anxieties without Edo-period precedent — overtime that multiplies through the night, factory dusk-shadows that strip faces from photographs, event-venue presences that drain warmth at the moment of power failure — providing the first systematic evidence that the folk practice, when reactivated under a new substrate, attaches itself to the objects of contemporary unease. We contribute (1) a conceptual position locating generative AI as folk medium within the existing art-discourse typology, (2) the empirical record of a contemporary-anxiety yōkai cluster, and (3) the *Folkloric Cultural Probe* — a reusable design pattern for instrumenting displaced folk practices.

This abstract:
- Opens with Benjamin (instant art-discourse credibility)
- Names the contribution typology explicitly (fifth position)
- Foregrounds the strongest finding (contemporary-anxiety cluster) over the 67% shift
- Closes with three discrete contributions
- Removes "recovery" language entirely

---

## 6. Alternative narratives (if the Benjamin frame doesn't land for you)

The Benjamin frame is the strongest, but here are three alternatives, each with different trade-offs:

### Alt-A: "Periodization without Benjamin"

Use the 4-substrate periodization (Oral → Edo woodblock → Mass media → Generative AI) without invoking Benjamin directly. Lighter theoretical apparatus; less anchored to canonical art discourse. Easier to write; weaker hook.

### Alt-B: "Speculative Folkloristics"

Position the work as a new mode of *doing* folklore studies — generative rather than descriptive. Cite Tangherlini's computational folkloristics, then argue that we extend it from corpus-description to corpus-generation. Aligns with digital humanities discourse. Risk: reviewers see it as a methods paper for folklorists, not an art contribution.

### Alt-C: "Ephemeral materialization as critique of permanence aesthetics"

Lead with the thermal-print ephemerality argument. Position the work as a critique of NFT/blockchain permanence and museum-collection logic. Cite Gonzalez-Torres, Goldsworthy, Steyerl's *Poor Image*. Strong for art-discourse but underdescribes the AI position. The Benjamin frame absorbs this argument as a sub-point; this alt makes it the headline.

### Alt-D: "Hybrid — Benjamin + Komatsu in parallel"

Open with both Benjamin (Western media theory) and Komatsu (yōkai-specific theory) in the introduction, then weave them together throughout. Heaviest theoretical scaffolding; longest paper. Possibly too dense for a 6-page Art Papers submission.

**Recommendation**: Lead with the Benjamin frame (main), absorb the periodization (Alt-A) and ephemerality critique (Alt-C) as sub-arguments inside it. Reserve Alt-B for a future DH/CHI venue.

---

## 7. How this redefines yōkai culture (the deepest claim)

Under the proposed narrative, the paper makes an implicit but strong claim about what yōkai *are*:

> Yōkai are not iconography. Yōkai are not entities. Yōkai are what a particular folk practice — the practice of naming inexplicable experience into shared cultural categories — *produces under whatever medium currently carries it*. The Edo woodblock-print catalog and the Reiwa generative-AI receipt are not different *kinds* of yōkai; they are the same practice carried by different substrates.

This is the redefinition. It moves yōkai from object (what they are) to practice (what they do) to substrate-dependent emergent (what they become under whatever medium reactivates them).

It implies a research agenda. If yōkai are substrate-emergent, then:

- The *content* of yōkai will continue to change as the substrate changes
- The *5-yōkai contemporary cluster* is a prediction, not a curiosity — every reactivation under a contemporary substrate will produce contemporary-content yōkai
- The *commercial-character era* (Mizuki, *Yo-kai Watch*) is not the end of yōkai but one of many substrate-conditions yōkai have inhabited
- The *international generalization* (Welsh, Slavic, Mexican folk practices) is direct: the same substrate-emergent argument should apply to any displaced folk practice

This is a publishable claim, and it is the kind of claim Art Papers reviewers reward. It positions the work not as a system-paper but as a **theoretical intervention with empirical demonstration**.

---

## 8. Risks and how to manage them

| Risk | Mitigation |
|---|---|
| **Benjamin reference is over-claimed** | Cite Benjamin once in §1, once in §5; let it frame, not dominate. Don't argue Benjamin scholarship; use the storyteller-function as scaffolding. |
| **"AI as folk medium" reads as romanticization of AI** | Pair every "folk medium" claim with explicit acknowledgment of training-data critique (Crawford, Bender). Position subordination as *response* to those critiques, not denial of them. |
| **International reviewers don't know Komatsu / Yanagita** | Use Foster's *Pandemonium and Parade* as the English-language anchor; translate the Komatsu thesis concisely in §1. |
| **The 5-yōkai cluster is small (n=5)** | Frame as "first documented evidence" not "statistical population." Position as proof-of-existence (which n=5 is sufficient for), not population estimate (which would need n>>30). |
| **Reviewers ask: what about the community/communal aspect of folk practice?** | Address head-on in §5. Acknowledge that individuated naming is a *new* mode the substrate makes possible — not the historical communal mode, but also not its failure; it is the substrate-condition's specific contribution. |

---

## 9. The single sentence

If everything else fell away and you had one sentence to pitch this paper to a reviewer, it should be:

> **We propose that generative AI, when subordinated to a specific folk practice, can function as a folk medium — and we demonstrate this by reactivating the Japanese yōkai naming practice and obtaining the first systematic evidence that the reactivated practice produces yōkai indexed to contemporary anxieties.**

If you can write this sentence without flinching, the paper is ready. If you flinch at any clause, that's the clause that needs more work.
