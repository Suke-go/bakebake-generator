'use client';

export default function ProgressDots({ current }: { current: number }) {
    const phases = [0, 1, 2, 3, 4]; // 0=intro, 1=handle, 2=deepen, 3=narrate, 4=form

    return (
        <div className="progress-dots">
            {phases.map((p) => (
                <div
                    key={p}
                    className={`progress-dot ${current === p ? 'active' : ''}`}
                />
            ))}
        </div>
    );
}
