# -*- coding: utf-8 -*-
"""Multi-page site generator. Structure mirrors cybernetic-being.org:
Home / About / Team / Works / Activities / Publications / Articles / Contact, JP + EN.
Run: python build.py  ->  site/*.html and site/en/*.html
"""
import pathlib
from html import escape

ROOT = pathlib.Path(__file__).parent
NAV = [("about", "About"), ("team", "Team"), ("works", "Works"), ("activities", "Activities"),
       ("publications", "Publications"), ("articles", "Articles"), ("contact", "Contact")]

T = {"ja": {}, "en": {}}
J, E = T["ja"], T["en"]

# ------------------------------------------------------------ common strings
J.update(title="Project BAKEBAKE",
         full="大規模伝承データを用いた妖怪伝承の計算論的解析と、生成AIを媒介とした現代の『不可解な経験』の共有・意味形成基盤の創出",
         program="日本財団 HUMAI プログラム",
         fund="日本財団 HUMAI プログラムの支援を受けて活動しています",
         hero_sub="大規模伝承データを用いた<br>妖怪伝承の計算論的解析と、<br>生成AIを媒介とした現代の<br>『不可解な経験』の共有・意味形成基盤の創出",
         whats_h="What's Project BAKEBAKE?",
         whats="国際日本文化研究センターの怪異・妖怪伝承データベースに収められた 3 万 5 千件超の記録を計算論的な観点から分析し、伝承の分布や偏り、類型を読み直す。あわせて、現代の人が自分の悩みや違和感を外に出して眺めるためのインターフェースとして妖怪を用い、体験から名前と図像を生成する装置を作って展示する。筑波大学と日本女子大学のメンバーで構成し、日本財団 HUMAI プログラムの支援を受けて活動している。",
         more="View More", pickup="Pick Up", members_h="Members", contact_h="Contact",
         contact_p="研究内容、共同研究、取材に関するお問い合わせは、下記までご連絡ください。",
         get_in_touch="Get in Touch", copyright="© Project BAKEBAKE",
         data="データ: 怪異・妖怪伝承データベース（国際日本文化研究センター）")
E.update(title="Project BAKEBAKE",
         full="Computational analysis of yōkai folklore from large-scale archives, and a generative-AI-mediated platform for sharing and making sense of contemporary inexplicable experiences",
         program="The Nippon Foundation HUMAI Program",
         fund="Supported by the Nippon Foundation HUMAI Program",
         hero_sub="Computational analysis of yōkai folklore<br>from large-scale archives, and<br>a generative-AI-mediated platform<br>for sharing and making sense of<br>contemporary inexplicable experiences",
         whats_h="What's Project BAKEBAKE?",
         whats="We analyze the more than 35,000 records of the Database of Folktales of Mysterious Phenomena and Yōkai (International Research Center for Japanese Studies) computationally, re-reading the distribution, biases, and types of transmitted tales. In parallel, we use yōkai as an interface through which people today can externalize and look at their own worries and unease, building and exhibiting an apparatus that generates a name and an image from a personal account. The team is based at the University of Tsukuba and Japan Women's University and is supported by the Nippon Foundation HUMAI Program.",
         more="View More", pickup="Pick Up", members_h="Members", contact_h="Contact",
         contact_p="For inquiries about the research, collaboration, or press, please contact us below.",
         get_in_touch="Get in Touch", copyright="© Project BAKEBAKE",
         data="Data: Database of Folktales of Mysterious Phenomena and Yōkai (International Research Center for Japanese Studies)")

# ------------------------------------------------------------ team
LINK = {"Kosuke Shimizu": "https://ksk432.com", "Mirai Hoshikawa": "https://miraihoshikawa.github.io/"}
PHOTO = {"Kosuke Shimizu": "m_shimizu.jpg", "Hiroki Ichikura": "m_ichikura.jpg", "Riri Ikebe": "m_ikebe.jpg", "Mirai Hoshikawa": "m_hoshikawa.jpg"}
J["groups"] = [("Members", "メンバー", [
    ("Kosuke Shimizu", "清水 紘輔", "妖怪生成装置の実装・実験設計", "筑波大学 情報学群 情報メディア創成学類"),
    ("Hiroki Ichikura", "一倉 弘毅", "アーカイブマップの構築", "個人事業主（日置市地域おこし協力隊）"),
    ("Riri Ikebe", "池辺 莉々", "文献調査", "日本女子大学 文学部 史学科"),
    ("Mirai Hoshikawa", "干川 未来", "XR コンテンツの開発", "筑波大学"),
])]
E["groups"] = [("Members", "", [
    ("Kosuke Shimizu", "清水 紘輔", "Apparatus implementation and experiment design", "College of Media Arts, Science and Technology, University of Tsukuba"),
    ("Hiroki Ichikura", "一倉 弘毅", "Archive map construction", "Independent (Hioki City community revitalization cooperator)"),
    ("Riri Ikebe", "池辺 莉々", "Literature research", "Department of History, Faculty of Humanities, Japan Women's University"),
    ("Mirai Hoshikawa", "干川 未来", "XR content development", "University of Tsukuba"),
])]

# ------------------------------------------------------------ works (year, image, tags, title en, title ja, body)
J["works"] = [
    ("2025–2026", "interface.png", ["Generative Apparatus"], "Yōkai-Generating Apparatus", "妖怪生成装置",
     "夜道で感じた気配や、なぜか心に残る出来事。妖怪生成装置は、あなたの不思議な体験をもとに、名前と物語、姿を持つ妖怪をつくる仕組みです。言葉にしにくかった感覚を、誰かに見せたり語ったりできる形にしていきます。\n\n"
     "まず、何が起きたか、そのときどう感じたかを入力します。装置は昔から伝わる妖怪の話から似たものを探し、あなたの体験と組み合わせて名前や物語を提案します。候補を選ぶことも、自分で名付けることもできます。\n\n"
     "続いて、外見や画風を選んで妖怪の姿を描きます。水墨画・絵巻・浮世絵・漫画・電脳という五つの表現から、自分の感覚に合うものを選べます。展示会場では、できあがった妖怪を感熱紙のお札に印刷して持ち帰る体験も用意しています。\n\n"
     "この制作では、人々が不思議な出来事を語り、名付け、描いてきた営みに着目しています。自分の中にあった曖昧な感覚が、一体の妖怪になる。その過程を、現代の技術で体験してもらうことを目指しています。",
     ("receipts.jpg", "体験によって生成された妖怪の札"), None),
    ("2025–2026", "geo_record.png", ["Archive Analysis", "Map"], "Yōkai Map / Geospatial Support", "妖怪マップ / 地理的支持の表現",
     "伝承データベースの 33,378 件について、行政的な支持範囲、地名候補、地名ではない場所の記述、地理的近接、人間の状態を表す語、派生的な境界、表示用アンカー、出所を分けて保持する。代表点を出来事の位置として扱わず、県と市町村のポリゴンを支持範囲として持つ。市町村支持を割り当てた 1,231 件では、県支持と比べて支持面積が中央値で 97.5% 縮小する。地形や水系と重ねた妖怪マップの基盤となる。",
     None, ("m6Qd-kOV1Ds?start=22", "妖怪マップのプロトタイプ")),
    ("2025–2026", "subspace.png", ["Archive Analysis", "Retrieval"], "Related-Yōkai Search", "関連妖怪検索",
     "基盤モデルの凍結埋め込みに対して、メタデータに基づくコントラスト学習を後付けで適用し、妖怪資料間の類似性を「話題」「地域」「現象」の複数軸に分解して扱う。単一の類似度では捉えにくい関係を軸ごとに見ることができ、展示では利用者が関心に応じて関連妖怪を探索できる。妖怪生成装置の検索段階もこの上で動く。",
     None, None),
    ("2025–2026", None, ["XR"], "XR Folklore Experience", "XR 伝承体験システム",
     "伝承の場面を XR で体験するシステム。妖怪生成装置、妖怪マップと合わせて XR Meetup Aichi と XR Kaigi で展示した。",
     None, ("aHgcSVWnUmc", "XR 伝承体験システムの映像プロトタイプ")),
]
E["works"] = [
    ("2025–2026", "interface.png", ["Generative Apparatus"], "Yōkai-Generating Apparatus", "妖怪生成装置",
     "A strange presence on a dark road, or a moment you cannot quite explain: this apparatus turns your experience into a yōkai with a name, story, and image that you can share.\n\n"
     "Describe what happened and how you felt. The apparatus finds related folklore and suggests names and stories. Choose a suggestion or name the yōkai yourself, then select its appearance and an artistic style. At exhibitions, the result can also become a printed paper talisman to take home.\n\n"
     "The project explores how people give form to mysterious experiences through storytelling, naming, and drawing. It invites you to take part in that process using today's technology.",
     ("receipts.jpg", "Receipts generated from visitors' experiences"), None),
    ("2025–2026", "geo_record.png", ["Archive Analysis", "Map"], "Yōkai Map / Geospatial Support", "妖怪マップ / 地理的支持の表現",
     "For 33,378 records in the database, administrative support areas, candidate toponyms, non-toponymic place descriptions, geographic proximity, human-condition terms, derived interfaces, display anchors, and provenance are kept as separate fields. A representative point is never treated as an event location; prefecture and municipality polygons are held as support areas. For the 1,231 records assigned municipality support, the support area shrinks by a median of 97.5% relative to prefecture support. This is the basis for the yōkai map overlaid on terrain and water systems.",
     None, ("m6Qd-kOV1Ds?start=22", "Yōkai map prototype")),
    ("2025–2026", "subspace.png", ["Archive Analysis", "Retrieval"], "Related-Yōkai Search", "関連妖怪検索",
     "Metadata-based contrastive learning is applied post hoc to frozen foundation-model embeddings so that similarity between records can be decomposed into topic, region, and phenomenon axes. Relations that a single similarity score obscures can be inspected axis by axis, and exhibition visitors can explore related yōkai according to their interest. The retrieval stage of the apparatus runs on the same basis.",
     None, None),
    ("2025–2026", None, ["XR"], "XR Folklore Experience", "XR 伝承体験システム",
     "A system for experiencing scenes from folklore in XR. Exhibited together with the apparatus and the yōkai map at XR Meetup Aichi and XR Kaigi.",
     None, ("aHgcSVWnUmc", "XR folklore experience prototype")),
]

# ------------------------------------------------------------ activities (label, date, image, title, body, link)
J["acts"] = [
    ('Exhibition', '2026/12', 'siggraph-asia-2026-logo.png', 'BAKEBAKE in SIGGRAPH Asia!', 'SIGGRAPH Asia 2026に出展します！ 2026年12月、マレーシア・クアラルンプールで、BAKEBAKEの「妖怪生成装置」を紹介します。\n\nふと感じた不思議な気配や、うまく言葉にできない日常のもやもや。そんな体験を入力すると、昔から伝わる妖怪の話を手がかりに、AIが妖怪の名前や物語、姿を提案します。自分で選んだり、名前を考えたりしながら、自分だけの妖怪をつくる体験です。\n\nSIGGRAPH Asiaは、コンピューターグラフィックスや、人とコンピューターの新しい関わり方をテーマにした国際会議・展示会です。2026年は12月1日〜4日にクアラルンプール・コンベンションセンター（KLCC）で開催されます。\n\n日常の小さな不思議が、どんな妖怪になるのか。会場でお会いできるのを楽しみにしています！', ('https://asia.siggraph.org/2026/', 'SIGGRAPH Asia 2026公式サイト')),
    ('Event', '2026/09/02', 'foss4g-2026-presentation-1.jpg', 'FOSS4G 2026にて発表しました', '2026年9月2日、地図や位置情報を扱うオープンソース技術の国際会議「FOSS4G 2026」にて、妖怪伝承を地図で読み解く研究を発表しました。国際日本文化研究センターの「怪異・妖怪伝承データベース」に収録された33,378件を対象に、物語がどのような場所と結びついているのかを調べる取り組みです。\n\n昔の妖怪の話には、地名だけでなく「川辺」「峠」「村はずれ」のような場所の描写が登場します。住所がわからなくても、そこがどんな場所だったかを知る手がかりになります。今回の研究では、文章からこうした言葉をコンピューターで取り出し、地図上の川や海、行政区域の情報と照らし合わせました。\n\n地図に載せるときに大切にしたのは、場所がどこまでわかっているかを伝えることです。県までしかわからない話は県の範囲で、市町村を絞り込める話はその範囲で扱い、文章に書かれた手がかりも一緒に残します。地図上の目印を、そのまま出来事が起きた正確な地点と受け取らないための工夫です。\n\n調べた伝承のうち、地名を含むものは約28％でしたが、場所の様子を表す言葉は約75％に見られました。また、河童の話には水辺に関する言葉、幽霊の話には死や弔いに関する言葉が結びつく傾向がありました。これは、伝承の中で何がどのような場所とともに語られているかを示す結果です。\n\n身近な土地にどんな物語が残り、人々が川や道、暮らしの境目をどう捉えてきたのか。場所の曖昧さも含めて伝承を整理することで、地域の文化を地図から読み解くための手がかりを示しました。\n\n発表題目：<span lang="en">Geographic Visualization of the Kaii-Yokai Folklore Database Using Open-Source GIS and NLP</span>', ('https://talks.osgeo.org/foss4g-2026/talk/LGWHNG/', '発表概要（FOSS4G 2026公式サイト・英語）')),
    ("Exhibition", "2026/02 – 2026/05", "venue.jpg", "妖怪EXPO 2026（小豆島）に出展",
     "改良した妖怪生成装置を出展。妖怪研究の第一人者である小松和彦氏に体験いただき、専門的な知見に基づく評価を得た。以降も各地で展示を継続し、79 セッションから 66 体の妖怪が生成された。", None),
    ("Event", "2026/01", None, "デジタルアーカイブ学会 第10回研究大会、第4回DH若手の会で発表",
     "一橋講堂にて、妖怪マップと妖怪生成装置の設計成果を発表。", ("https://www.jstage.jst.go.jp/article/jsda/9/s2/9_s226/_article/-char/ja", "発表原稿（J-STAGE）")),
    ("Workshop", "2025", None, "湘南白百合学園中学・高等学校 特別授業での展示",
     "研究成果の社会還元として、特別授業における展示を実施。", None),
    ("Exhibition", "2025", None, "XR Kaigi に出展",
     "妖怪生成装置と XR 伝承体験システムを展示。来場者の反応をもとに展示構成とインタラクションを再設計した。", None),
    ("Exhibition", "2025", None, "XR Meetup Aichi に出展",
     "妖怪生成装置、XR 伝承体験システム、妖怪マップを展示。", None),
]
E["acts"] = [
    ('Exhibition', '2026/12', 'siggraph-asia-2026-logo.png', 'BAKEBAKE in SIGGRAPH Asia!', 'We’re exhibiting at SIGGRAPH Asia 2026! This December, we’ll bring BAKEBAKE’s yōkai-generating apparatus to Kuala Lumpur, Malaysia.\n\nAn unexplained presence, a strange feeling, or an everyday moment that is hard to put into words: tell the apparatus about your experience, and AI draws on traditional Japanese folklore to suggest a yōkai’s name, story, and appearance. Choose from the suggestions or invent a name yourself to make the yōkai your own.\n\nSIGGRAPH Asia is an international conference and exhibition exploring computer graphics and new ways for people to interact with technology. The 2026 event takes place on December 1–4 at the Kuala Lumpur Convention Centre (KLCC).\n\nWhat kind of yōkai will emerge from your everyday mysteries? We look forward to seeing you there!', ('https://asia.siggraph.org/2026/', 'SIGGRAPH Asia 2026 official website')),
    ('Event', '2026/09/02', 'foss4g-2026-presentation-1.jpg', 'Presented at FOSS4G 2026', 'On September 2, 2026, we presented our research at FOSS4G 2026, an international conference on open-source mapping and geospatial technology. We explored how stories connect with places using 33,378 records from the Kaii-Yokai Folklore Database maintained by the International Research Center for Japanese Studies.\n\nOld stories about yōkai, the mysterious beings of Japanese folklore, often mention a riverbank, mountain pass, or village edge. These descriptions offer clues about a setting even without an address. We used software to extract such clues from the stories and compare them with map information about rivers, coastlines, and administrative areas.\n\nOur approach keeps track of how precisely a place is known. A story located only within a prefecture remains associated with that area; one with clearer evidence can be narrowed down to a municipality. The words in the story are preserved alongside this information, so a marker on the map is not mistaken for the exact site of an event.\n\nAbout 28% of the records contain place names, while about 75% contain words describing places. Kappa stories tend to use water-related language, and ghost stories tend to use words about death and mourning. These findings describe how places appear in the stories.\n\nKeeping these clues and uncertainties visible helps us explore local culture through maps: what stories people told about their surroundings, and how they understood familiar places.\n\nTalk title: Geographic Visualization of the Kaii-Yokai Folklore Database Using Open-Source GIS and NLP', ('https://talks.osgeo.org/foss4g-2026/talk/LGWHNG/', 'Read the abstract on the FOSS4G 2026 website')),
    ("Exhibition", "2026/02 – 2026/05", "venue.jpg", "Exhibited at YOKAI EXPO 2026, Shodoshima",
     "The revised apparatus was exhibited. Kazuhiko Komatsu, the leading scholar of yōkai studies, tried it and gave an evaluation based on his expertise. Exhibitions continued at further venues; 79 sessions produced 66 yōkai.", None),
    ("Event", "2026/01", None, "Presentations at the Japan Society for Digital Archive 10th Annual Meeting and the 4th DH Young Researchers' Meeting",
     "Presentation of the yōkai map and apparatus design at Hitotsubashi Hall.", ("https://www.jstage.jst.go.jp/article/jsda/9/s2/9_s226/_article/-char/ja", "Proceedings (J-STAGE)")),
    ("Workshop", "2025", None, "Exhibition in a special class at Shonan Shirayuri Gakuen Junior and Senior High School",
     "Exhibition as part of a special class.", None),
    ("Exhibition", "2025", None, "Exhibited at XR Kaigi",
     "Exhibition of the apparatus and the XR folklore experience. Exhibit layout and interaction were redesigned from visitor feedback.", None),
    ("Exhibition", "2025", None, "Exhibited at XR Meetup Aichi",
     "Exhibition of the apparatus, the XR folklore experience, and the yōkai map.", None),
]

# ------------------------------------------------------------ publications (year -> entries: authors, title, venue, date, link)
PUBS = [
    ("2026", [
        ("Kosuke Shimizu, Riri Ikebe, Hiroki Ichikura, Mirai Hoshikawa", "Naming the Inexplicable: A Generative Apparatus for Rehearsing Yōkai-Making in Compressed Communal Time", "SIGGRAPH Asia 2026 Art Papers", "2026.12", ("https://doi.org/10.1145/3829215.3843681", "DOI: 10.1145/3829215.3843681")),
        ("Kosuke Shimizu, Riri Ikebe, Hiroki Ichikura, Mirai Hoshikawa", "BAKEBAKE: Making Ambiguous Experiences Visible through Generative Yōkai", "Proceedings of the 14th International Conference on Human-Agent Interaction (HAI '26), ACM", "2026.11", ("https://doi.org/10.1145/3841580.3845680", "DOI: 10.1145/3841580.3845680")),
        ("Kosuke Shimizu, Hiroki Ichikura, Riri Ikebe, Mirai Hoshikawa", "From Point Anchors to Geospatial Support: A Resolution-Aware Representation of Toponymic and Non-Toponymic Place Evidence in a Japanese Yokai Archive", "Int. Arch. Photogramm. Remote Sens. Spatial Inf. Sci., L-4/W1-2026, pp. 283–290", "2026.08", ("https://doi.org/10.5194/isprs-archives-L-4-W1-2026-283-2026", "DOI: 10.5194/isprs-archives-L-4-W1-2026-283-2026")),
    ]),
    ("2025", [
        ("一倉弘毅, 清水紘輔, 干川未来, 池辺莉々", "[P10] 没入型技術とAIを活用した妖怪のインタラクティブなデジタルプラットフォーム『ばけばけXR』の取り組み", "デジタルアーカイブ学会誌, Vol. 9, No. s2, pp. s226–s229", "2025", ("https://doi.org/10.24506/jsda.9.s2_s226", "DOI: 10.24506/jsda.9.s2_s226")),
    ]),
]
J["pubs"] = E["pubs"] = PUBS

# ------------------------------------------------------------ articles
J["articles"] = [("note", "2026/02/22", "～妖怪EXPO2026に参加しました～", "妖怪生成装置の制作背景と、体験を名前・物語・姿にする仕組みを紹介しています。", "https://note.com/galileonics/n/nb37f8924070f")]
E["articles"] = [("note", "2026/02/22", "Exhibiting at YOKAI EXPO 2026 (Japanese)", "The ideas and design behind the yōkai-generating apparatus.", "https://note.com/galileonics/n/nb37f8924070f")]

# ------------------------------------------------------------ about page text
J["about_sections"] = [
    ("Concept", "妖怪伝承を二つの方向から扱う",
     "ひとつは、怪異・妖怪伝承データベースに収められた 3 万 5 千件超の記録を計算論的な観点から分析し、伝承の分布や偏り、類型を読み直すこと。地名の抽出と地理的な支持範囲の表現、妖怪種と地域の偏りや出典集中の診断、資料間の関連を話題・地域・現象の複数軸に分けた検索を行う。もうひとつは、現代の人が自分の悩みや違和感を外に出して眺めるためのインターフェースとして妖怪を用い、体験から名前と図像を生成する装置を作って展示すること。来場者が語った経験を伝承データベースと照合し、名前・語り・図像の候補を提案して、来場者が選び、直し、あるいは棄却する。結果は感熱紙に印字して持ち帰る。"),
]
E["about_sections"] = [
    ("Concept", "Two directions of work on yōkai folklore",
     "One is computational analysis of the more than 35,000 records of the Database of Folktales of Mysterious Phenomena and Yōkai, re-reading the distribution, biases, and types of transmitted tales: place-name extraction and representation of geographic support, diagnosis of biases in yōkai type by region and concentration of sources, and search along separate axes of topic, region, and phenomenon. The other is to use yōkai as an interface through which people today can externalize and look at their own worries and unease, building and exhibiting an apparatus that generates a name and an image from a personal account. A visitor's account is matched against the archive, candidate names, narratives, and images are proposed, and the visitor accepts, edits, or rejects them. The result is printed on thermal paper and taken home."),
]
J["research_groups"] = [
    ("Archive Analysis", "アーカイブ分析", "伝承データの計算論的解析", "地理的支持の表現、偏りの診断、多軸の関連検索。妖怪マップと関連妖怪検索。"),
    ("Generative Apparatus", "生成装置", "悩みを外在化するインターフェースとしての妖怪", "体験から名前・語り・図像を生成し、感熱紙に印字して手渡す装置。展示と調査。"),
]
E["research_groups"] = [
    ("Archive Analysis", "", "Computational analysis of folklore records", "Geospatial support representation, bias diagnosis, multi-axis related-record search. The yōkai map and related-yōkai search."),
    ("Generative Apparatus", "", "Yōkai as an interface for externalizing worries", "An apparatus that generates a name, narrative, and image from an account, prints it on thermal paper, and hands it over. Exhibition and survey."),
]



ACT_SUMMARIES = {'ja': {'siggraph-asia-2026': 'SIGGRAPH Asia 2026に出展します。あなたの体験から妖怪が生まれる「妖怪生成装置」を紹介します。', 'foss4g-2026': '約3万3千件の妖怪伝承から、物語と場所のつながりを読み解く研究を紹介しました。'}, 'en': {'siggraph-asia-2026': 'We’re exhibiting at SIGGRAPH Asia 2026! Discover an apparatus that turns your experiences into yōkai.', 'foss4g-2026': 'Exploring the links between stories and places through more than 33,000 records of Japanese yōkai folklore.'}}

WORK_SLUGS = ["apparatus", "map", "search", "xr"]
ACT_SLUGS = ["siggraph-asia-2026", "foss4g-2026", "yokai-expo-2026", "jsda-2026", "shonan-shirayuri", "xr-kaigi", "xr-meetup-aichi"]
RECORD_PHOTOS = {"venue.jpg", "booth.jpg", "receipts.jpg"}   # 記録写真は白黒。装置の画面と生成図像はカラー。

# ================================================================ rendering
ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14 3h7v7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M21 3 11 13" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 13v7H4V5h7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'


def plink(name):
    if name not in LINK:
        return ""
    u = LINK[name]
    return f'<a class="plink" href="{u}" target="_blank" rel="noopener" aria-label="{u}">{ICON}<span>{u.replace("https://", "").rstrip("/")}</span></a>'


def img(assets, name, alt="", cls=""):
    if name == 'siggraph-asia-2026-logo.png':
        cls = (cls + ' event-logo').strip()
        alt = alt or 'SIGGRAPH Asia 2026 Kuala Lumpur'
    bw = " bw" if name in RECORD_PHOTOS or name.startswith("m_") else ""
    c = (cls + bw).strip()
    attr = f' class="{c}"' if c else ""
    return f'<img src="{assets}assets/{name}" alt="{alt}"{attr}>'


def shell(lang, page, body, root, home=False, title=None, description=None):
    """root: prefix back to the language root ('' or '../'). Assets sit one level above the EN root."""
    body = '\n'.join(line.rstrip() for line in body.splitlines())
    t = T[lang]
    assets = root + ("../" if lang == "en" else "")
    nav = "".join(f'<a href="{root}{p}.html"{" class=on" if p == page.split("/")[0] else ""}>{n}</a>' for p, n in NAV)
    cur = f"{page}.html" if page in dict(NAV) or page == "index" else page
    if lang == "ja":
        ja, en = root + cur, root + "en/" + cur
    else:
        ja, en = root + "../" + cur, root + cur
    langs = f'<span class="langs"><a href="{ja}" class="{"cur" if lang=="ja" else ""}">JP</a><a href="{en}" class="{"cur" if lang=="en" else ""}">EN</a></span>'
    fnav = "".join(f'<a href="{root}{p}.html">{n}</a>' for p, n in NAV)
    ttl = t["title"] + ("" if page == "index" else " | " + (title or dict(NAV).get(page, "")))
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{ttl}</title>
<meta name="description" content="{escape(description or (t['title'] + ' | ' + t['full']), quote=True)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaisei+Tokumin:wght@400;500;700;800&display=swap">
<link rel="stylesheet" href="{assets}site.css">
</head>
<body>
<header class="top{' over' if home else ''}">
  <div class="wrap bar">
    <a class="brand" href="{root}index.html"><img class="mark" src="{assets}assets/bakebake-logo.png" alt="" width="80" height="80">Project BAKEBAKE</a>
    <nav>{nav}{langs}</nav>
  </div>
</header>
{body}
<footer>
  <div class="wrap">
    <nav class="fnav">{fnav}</nav>
    <div class="frow">
      <div class="logos"><a class="logo img" href="https://x.com/humai_program" target="_blank" rel="noopener"><img src="{assets}assets/humai_logo.jpg" alt="{t['program']}"></a></div>
      <div class="fnote">{t['data']}<br>{t['copyright']}</div>
    </div>
  </div>
</footer>
</body>
</html>
"""


def card(root, assets, label, date, image, title, href):
    im = img(assets, image) if image else '<span class="ph"></span>'
    return f'<a class="card" href="{root}{href}"><figure>{im}</figure><span class="lab">{label}</span><time>{date}</time><b>{title}</b></a>'


def apparatus_trial(lang):
    label = '妖怪生成装置を体験する' if lang == 'ja' else 'Try the yōkai-generating apparatus'
    return f'<p><a class="btn" href="https://bakemon.net/" target="_blank" rel="noopener">{label}（bakemon.net）</a></p>'


def work_title(lang, w):
    return w[4] if lang == "ja" else w[3]


def yt_thumb(video):
    return f'<img src="https://img.youtube.com/vi/{video[0].split("?")[0]}/hqdefault.jpg" alt="">'


def page_index(lang):
    t = T[lang]; root = ""; assets = "../" if lang == "en" else ""
    w = t["works"]; a = t["acts"]
    pick = [card(root, assets, "Exhibition", a[0][1], a[0][2], a[0][3], f"activities/{ACT_SLUGS[0]}.html"),
            card(root, assets, "Publication", "2026.12", "contemporary.jpg", t["pubs"][0][1][0][1], "publications.html"),
            card(root, assets, "Work", w[0][0], w[0][1], work_title(lang, w[0]), f"works/{WORK_SLUGS[0]}.html"),
            card(root, assets, "Work", w[1][0], w[1][1], work_title(lang, w[1]), f"works/{WORK_SLUGS[1]}.html")]
    mem = "".join(f'<li>{img(assets, PHOTO[en], en, "face")}<div><b>{en}{plink(en)}</b><span class="ja">{ja}</span><span>{role}</span><span class="aff">{aff}</span></div></li>'
                  for en, ja, role, aff in t["groups"][0][2])
    body = f"""
<section class="hero">
  <div class="photo" aria-hidden="true"><img src="{assets}assets/venue.jpg" alt=""><span class="grain"></span></div>
  <div class="wrap hero-in">
    <h1>Project<br>BAKEBAKE</h1>
    <p class="sub">{t['hero_sub']}</p>
  </div>
</section>

<section class="sec whats">
  <div class="wrap">
    <h2>{t['whats_h']}</h2>
    <p class="full">{t['full']}</p>
    <p>{t['whats']}</p>
    <a class="btn" href="about.html">{t['more']}</a>
    {apparatus_trial(lang)}
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <h2>{t['pickup']}</h2>
    <div class="cards">{''.join(pick)}</div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <h2>{t['members_h']}</h2>
    <ul class="mlist">{mem}</ul>
    <a class="btn" href="team.html">{t['more']}</a>
  </div>
</section>

<section class="sec contact">
  <div class="wrap">
    <h2>{t['contact_h']}</h2>
    <p>{t['contact_p']}</p>
    <a class="btn" href="contact.html">{t['get_in_touch']}</a>
  </div>
</section>
"""
    return shell(lang, "index", body, root, home=True)


def page_about(lang):
    t = T[lang]; assets = "../" if lang == "en" else ""
    secs = "".join(f'<section class="blk"><span class="lab">{k}</span><h2>{h}</h2><p>{p}</p></section>' for k, h, p in t["about_sections"])
    groups = "".join(f'<li><b>{en}</b>{"<span class=ja>"+ja+"</span>" if ja else ""}<span class="sub">{sub}</span><p>{p}</p><a class="u" href="team.html">{t["more"]}</a></li>' for en, ja, sub, p in t["research_groups"])
    body = f"""
<section class="page">
  <div class="wrap">
    <span class="lab">{t['program']}</span>
    <h1>About</h1>
    <p class="pagesub">{t['full']}</p>
    <figure class="wide">{img(assets, "venue.jpg")}<figcaption>{'YOKAI EXPO 2026, Shodoshima' if lang=='en' else '妖怪EXPO 2026、小豆島'}</figcaption></figure>
    {secs}
    <section class="blk"><span class="lab">Research Groups</span><ul class="groups">{groups}</ul></section>
  </div>
</section>
"""
    return shell(lang, "about", body, "")


def page_team(lang):
    t = T[lang]; assets = "../" if lang == "en" else ""
    out = []
    for en, ja, members in t["groups"]:
        cards = "".join(f'<li>{img(assets, PHOTO[n], n, "face")}<b>{n}{plink(n)}</b><span class="ja">{j}</span><span>{r}</span><span class="aff">{a}</span></li>' for n, j, r, a in members)
        out.append(f'<section class="blk"><h2>{en}{" <small>"+ja+"</small>" if ja else ""}</h2><ul class="team">{cards}</ul></section>')
    body = f'<section class="page"><div class="wrap"><h1>Team</h1>{"".join(out)}</div></section>'
    return shell(lang, "team", body, "")


def page_works(lang):
    """List: thumbnail, tags, title. Grouped by year."""
    t = T[lang]; assets = "../" if lang == "en" else ""
    years = {}
    for i, w in enumerate(t["works"]):
        years.setdefault(w[0], []).append((i, w))
    out = []
    for y, ws in years.items():
        items = []
        for i, (_, image, tags, ten, tja, _text, _strip, video) in ws:
            im = img(assets, image) if image else yt_thumb(video)
            tg = "".join(f'<span class="tag">{x}</span>' for x in tags)
            items.append(f'<a class="wcard" href="works/{WORK_SLUGS[i]}.html"><figure>{im}</figure><div class="tags">{tg}</div><b>{ten}</b><small>{tja}</small></a>')
        out.append(f'<section class="blk"><h2>{y}</h2><div class="wgrid">{"".join(items)}</div></section>')
    body = f'<section class="page"><div class="wrap"><h1>Works</h1>{"".join(out)}</div></section>'
    return shell(lang, "works", body, "")


def page_work_detail(lang, i):
    t = T[lang]; root = "../"; assets = root + ("../" if lang == "en" else "")
    year, image, tags, ten, tja, text, strip, video = t["works"][i]
    media = f'<figure class="lead">{img(assets, image)}</figure>' if image else ""
    if video:
        media += f'<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/{video[0]}" title="{video[1]}" loading="lazy" allowfullscreen></iframe><figcaption>{video[1]}</figcaption></div>'
    st = f'<figure class="strip">{img(assets, strip[0])}<figcaption>{strip[1]}</figcaption></figure>' if strip else ""
    tg = "".join(f'<span class="tag">{x}</span>' for x in tags)
    paragraphs = ''.join(f'<p>{paragraph}</p>' for paragraph in text.split('\n\n'))
    links = ''
    if WORK_SLUGS[i] == 'apparatus':
        note_label = '制作の背景と仕組みをnoteで読む' if lang == 'ja' else 'Read about the ideas and design on note (Japanese)'
        links = f'<p><a class="u" href="https://note.com/galileonics/n/nb37f8924070f" target="_blank" rel="noopener">{note_label}</a></p>' + apparatus_trial(lang)
    body = f"""
<section class="page detail">
  <div class="wrap">
    <a class="back" href="{root}works.html">← Works</a>
    <div class="tags">{tg}<time>{year}</time></div>
    <h1>{ten}<small>{tja}</small></h1>
    {media}
    <div class="txt">{paragraphs}{links}</div>
    {st}
  </div>
</section>
"""
    return shell(lang, f"works/{WORK_SLUGS[i]}.html", body, root, title=ten,
                 description=text.split('\n\n')[0] if WORK_SLUGS[i] == 'apparatus' else None)


def page_activities(lang):
    t = T[lang]; assets = "../" if lang == "en" else ""
    items = []
    for i, (label, date, image, title, text, link) in enumerate(t["acts"]):
        im = f'<figure>{img(assets, image)}</figure>' if image else '<figure><span class="ph"></span></figure>'
        summary = ACT_SUMMARIES[lang].get(ACT_SLUGS[i])
        intro = f'<p>{summary}</p>' if summary else ''
        items.append(f'<li class="act"><a href="activities/{ACT_SLUGS[i]}.html">{im}<div><span class="lab">{label}</span>{activity_time(date)}<b>{title}</b>{intro}</div></a></li>')
    body = f'<section class="page"><div class="wrap"><h1>Activities</h1><ul class="acts">{"".join(items)}</ul></div></section>'
    return shell(lang, "activities", body, "")


def activity_time(date):
    iso = date.replace('/', '-')
    attr = f' datetime="{iso}"' if len(iso) in (7, 10) and all(part.isdigit() for part in iso.split('-')) else ''
    return f'<time{attr}>{date}</time>'


def page_act_detail(lang, i):
    t = T[lang]; root = "../"; assets = root + ("../" if lang == "en" else "")
    label, date, image, title, text, link = t["acts"][i]
    media = f'<figure class="lead">{img(assets, image)}</figure>' if image else ""
    photo = ''
    if ACT_SLUGS[i] == 'foss4g-2026':
        captions = ('妖怪の成り立ちを紹介する、FOSS4G 2026での発表の様子',
                    '伝承データを地理情報として整理する手順を説明') if lang == 'ja' else (
                    'Introducing yōkai folklore during the FOSS4G 2026 presentation',
                    'Explaining how folklore records are organized into geographic information')
        media = f'<figure class="lead">{img(assets, image, captions[0])}<figcaption>{captions[0]}</figcaption></figure>'
        photo = f'<figure class="lead activity-photo">{img(assets, "foss4g-2026-presentation-2.jpg", captions[1])}<figcaption>{captions[1]}</figcaption></figure>'
    l = f'<p><a class="u" href="{link[0]}" target="_blank" rel="noopener">{link[1]}</a></p>' if link else ""
    paragraphs = ''.join(f'<p>{paragraph}</p>' for paragraph in text.split('\n\n'))
    trial = apparatus_trial(lang) if ACT_SLUGS[i] == 'siggraph-asia-2026' else ''
    body = f"""
<section class="page detail">
  <div class="wrap">
    <a class="back" href="{root}activities.html">← Activities</a>
    <div class="tags"><span class="lab">{label}</span>{activity_time(date)}</div>
    <h1>{title}</h1>
    {media}
    <div class="txt">{paragraphs}{l}{trial}</div>{photo}
  </div>
</section>
"""
    return shell(lang, f"activities/{ACT_SLUGS[i]}.html", body, root, title=title,
                 description=ACT_SUMMARIES[lang].get(ACT_SLUGS[i]))


def page_publications(lang):
    t = T[lang]
    out = []
    for y, entries in t["pubs"]:
        lis = []
        for au, ti, ve, da, link in entries:
            l = f' <a class="u" href="{link[0]}" target="_blank" rel="noopener">{link[1]}</a>' if link else ""
            lis.append(f'<li>❏ {au}, “{ti}”, {ve}, {da}.{l}</li>')
        out.append(f'<section class="blk"><h2>{y}</h2><ul class="pubs">{"".join(lis)}</ul></section>')
    body = f'<section class="page"><div class="wrap"><h1>Publications</h1>{"".join(out)}</div></section>'
    return shell(lang, "publications", body, "")


def page_articles(lang):
    t = T[lang]
    lis = "".join(f'<li class="act"><a href="{u}" target="_blank" rel="noopener"><figure><span class="ph"></span></figure><div><span class="lab">{lab}</span><time>{d}</time><b>{ti}</b><p>{p}</p></div></a></li>' for lab, d, ti, p, u in t["articles"])
    body = f'<section class="page"><div class="wrap"><h1>Articles</h1><ul class="acts">{lis}</ul></div></section>'
    return shell(lang, "articles", body, "")


def page_contact(lang):
    t = T[lang]
    body = f"""<section class="page"><div class="wrap"><h1>Contact</h1>
<p class="pagesub">{t['contact_p']}</p>
<p class="mail"><a class="u" href="mailto:shimizu@ai.iit.tsukuba.ac.jp">shimizu@ai.iit.tsukuba.ac.jp</a></p>
<p class="dim">{'University of Tsukuba · Japan Women’s University' if lang=='en' else '筑波大学 · 日本女子大学'}<br>{t['fund']}</p>
</div></section>"""
    return shell(lang, "contact", body, "")


BUILDERS = dict(index=page_index, about=page_about, team=page_team, works=page_works,
                activities=page_activities, publications=page_publications, articles=page_articles, contact=page_contact)

if __name__ == "__main__":
    n = 0
    for lang in ("ja", "en"):
        out = ROOT if lang == "ja" else ROOT / "en"
        (out / "works").mkdir(parents=True, exist_ok=True)
        (out / "activities").mkdir(parents=True, exist_ok=True)
        for p, fn in BUILDERS.items():
            (out / f"{p}.html").write_text(fn(lang), encoding="utf-8"); n += 1
        for i, slug in enumerate(WORK_SLUGS):
            (out / "works" / f"{slug}.html").write_text(page_work_detail(lang, i), encoding="utf-8"); n += 1
        for i, slug in enumerate(ACT_SLUGS):
            (out / "activities" / f"{slug}.html").write_text(page_act_detail(lang, i), encoding="utf-8"); n += 1
    print("built", n, "pages")
