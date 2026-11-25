'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { catalogScore } from '@/lib/catalog-search';

type Record = { id: string; name: string; imageUrl: string; sourceUrl: string; tags: string[] };
type Catalog = { records: Record[]; count: number; searchesCompleted: number; searchesTotal: number };
type LocationStatus = { code: string; coverage?: string; description?: string; source_bibliography?: string };
type Locations = { records: { [id: string]: LocationStatus } };

function shortName(name: string) {
    return name.split(/[；;，,、]/).map(part => part.trim()).find(Boolean) || '名前のない妖怪';
}

function bookName(value?: string) {
    return (value || '').replace(/^親書誌[：:]\s*[^：:]+[：:]\s*/, '').split(/[；;]/)[0].trim();
}

const PAGE_SIZE = 48;

export default function YokaiImages() {
    return <Suspense fallback={<p>画像目録を読み込み中…</p>}><YokaiImagesContent /></Suspense>;
}

function YokaiImagesContent() {
    const searchParams = useSearchParams();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [error, setError] = useState('');
    const [input, setInput] = useState('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [locations, setLocations] = useState<Locations | null>(null);
    const [locationError, setLocationError] = useState('');
    const [locationOverride, setLocationFilter] = useState<string | null>(null);
    const requestedFilter = locationOverride ?? searchParams.get('location') ?? 'all';
    const locationFilter = ['all', 'mapped', 'unmapped'].includes(requestedFilter) ? requestedFilter : 'unmapped';
    useEffect(() => {
        const controller = new AbortController();
        const refresh = () => fetch('/youkai-gazou-location-status.json', { cache: 'no-store', signal: controller.signal })
            .then(response => { if (!response.ok) throw new Error('絵の説明を読み込めませんでした。再読み込みしてください。'); return response.json(); })
            .then(data => { setLocations(data); setLocationError(''); })
            .catch(error => { if (!controller.signal.aborted) setLocationError(String(error)); });
        void refresh();
        const timer = setInterval(refresh, 30000);
        return () => { controller.abort(); clearInterval(timer); };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/youkai-gazou-catalog.json', { signal: controller.signal })
            .then(response => { if (!response.ok) throw new Error('画像目録を読み込めませんでした。'); return response.json(); })
            .then(setCatalog).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
        return () => controller.abort();
    }, []);
    const results = useMemo(() => (catalog?.records ?? [])
        .filter(record => locationFilter === 'all' || (locations?.records[record.id] && (locationFilter === 'unmapped' ? locations.records[record.id].code !== 'mapped' : locations.records[record.id].code === locationFilter)))
        .map(record => ({ record, score: catalogScore(`${record.name} ${record.tags.join(' ')} ${record.id} ${locations?.records[record.id]?.coverage || ''} ${locations?.records[record.id]?.description || ''}`, query) }))
        .filter(item => item.score > 0).sort((a, b) => b.score - a.score), [catalog, query, locations, locationFilter]);
    return <main className="catalog">
        <header><p>BAKEBAKE / 妖怪を探す</p><h1>絵から妖怪を探す</h1>
            <p>気になる姿やしぐさから、妖怪の絵を見つけてみましょう。</p>
            <nav><Link href="/map">YokaiMap・伝承の地図へ →</Link>　<a href="https://www.nichibun.ac.jp/YoukaiGazou/" target="_blank" rel="noreferrer">日文研の原サイト ↗</a></nav>
        </header>
        <form onSubmit={event => { event.preventDefault(); setQuery(input); setPage(0); }}>
            <label htmlFor="image-search">名前・特徴・しぐさ</label>
            <div className="search"><input id="image-search" value={input} onChange={event => setInput(event.target.value)} placeholder="例：河童、赤い顔、踊る" /><button>検索</button>
                <button type="button" onClick={() => { setInput(''); setQuery(''); setLocationFilter('all'); setPage(0); }}>全件表示</button></div>
        </form>
        <label htmlFor="location-filter">探す範囲</label>
        <select id="location-filter" value={['all', 'mapped', 'unmapped'].includes(locationFilter) ? locationFilter : 'unmapped'} disabled={!locations} onChange={event => { setLocationFilter(event.target.value); setPage(0); }}>
            <option value="all">すべての絵</option><option value="mapped">地図でも見られる絵</option><option value="unmapped">地図に載っていない絵</option>
        </select>
        {locationError && <p role="status">{locationError}</p>}
        <p aria-live="polite">{error || (!catalog ? '絵を読み込み中…' : `${results.length.toLocaleString()}件の絵`)}</p>
        <section className="grid" aria-label="検索結果">{results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ record }) => <article className="card" key={record.id}>
            <a href={record.sourceUrl} target="_blank" rel="noreferrer">
            {/* Archive thumbnails remain on the source server; load only the visible page. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={record.imageUrl} alt={record.name || '妖怪資料'} loading="lazy" referrerPolicy="no-referrer" />
            <h2>{shortName(record.name)}</h2>
            </a>
            {locations?.records[record.id]?.description && <p className="description">{locations.records[record.id].description}</p>}
            {bookName(locations?.records[record.id]?.source_bibliography) && <p className="book">『{bookName(locations?.records[record.id]?.source_bibliography)}』より</p>}
            <a className="sourceLink" href={record.sourceUrl} target="_blank" rel="noreferrer">この絵の原資料を見る ↗</a>
            <details><summary>資料について</summary>
                <p>原資料の表記：{record.name}</p>
                {locations?.records[record.id]?.coverage && <p>資料に記された場所：{locations.records[record.id].coverage}</p>}
                <small>資料ID：{record.id}</small>
            </details>
        </article>)}</section>
        {catalog && !results.length && <p>該当する資料がありません。別の言葉で検索してください。</p>}
        <nav className="pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button><span>{page + 1} / {Math.max(1, Math.ceil(results.length / PAGE_SIZE))}</span><button disabled={(page + 1) * PAGE_SIZE >= results.length} onClick={() => setPage(page + 1)}>次へ</button></nav>
        <footer>出典：<a href="https://www.nichibun.ac.jp/YoukaiGazou/" target="_blank" rel="noreferrer">国際日本文化研究センター「怪異・妖怪画像データベース」</a></footer>
        <style jsx>{`
            .catalog { font-family: system-ui, sans-serif; height: 100dvh; overflow: auto; background: #f3efe5; color: #29271f; padding: 32px max(20px, calc((100vw - 1280px) / 2)); }
            h1 { font-size: clamp(24px, 4vw, 36px); margin: 12px 0; } p { line-height: 1.7; } nav { margin: 18px 0; } a { color: inherit; }
            form { margin: 28px 0 16px; } label { display: block; margin-bottom: 8px; } .search { display: flex; gap: 8px; flex-wrap: wrap; }
            input { flex: 1; min-width: 180px; padding: 14px; background: white; color: #29271f; border: 1px solid #aaa38f; border-radius: 6px; }
            button { padding: 12px 18px; background: #343f35; color: white; border: 0; border-radius: 6px; cursor: pointer; } button:disabled { opacity: .4; cursor: default; }
            .note { font-size: 12px; color: #625e51; } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; margin-top: 24px; }
            .card { padding: 14px; border: 1px solid #d4ccba; background: #fffdf7; border-radius: 8px; text-decoration: none; overflow-wrap: anywhere; }
            .card img { width: 100%; height: 200px; object-fit: contain; } h2 { font-size: 16px; line-height: 1.5; margin-top: 12px; } .card p { font-size: 12px; } small { font-size: 10px; color: #6c685e; }
            .card a { text-decoration: none; } details { margin-top: 16px; } summary { cursor: pointer; font-size: 13px; line-height: 1.6; } select { max-width: 100%; padding: 10px; background: white; color: #29271f; }
            .description { font-size: 14px !important; line-height: 1.8; }
            .book { color: #625e51; }
            .sourceLink { display: inline-block; margin-top: 8px; text-decoration: underline !important; font-size: 13px; }
            footer { font-size: 12px; padding: 20px 0; }
            .pages { display: flex; justify-content: center; align-items: center; gap: 20px; padding: 24px 0; }
        `}</style>
    </main>;
}
