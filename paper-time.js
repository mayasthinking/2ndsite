(() => {
    const palettes = {
        dark: [
            [0, "#514341"],
            [5, "#5c4a47"],
            [8, "#645149"],
            [12, "#6b584e"],
            [16, "#675046"],
            [18.5, "#60473f"],
            [20.5, "#58413f"],
            [24, "#514341"]
        ]
    };

    const themes = {
        light: {
            "--ink": "#24211f",
            "--hover": "#8b2f32",
            "--line": "rgba(139, 47, 50, 0.2)",
            "--muted": "rgba(36, 33, 31, 0.58)",
            "--overlay-ink": "var(--paper)",
            "--overlay-backdrop": "rgba(36, 33, 31, 0.72)",
            "--paper-frame-base": "#ded8cf",
            "--paper-frame-share": "70%",
            "--paper-highlight": "white",
            "--toggle-mix-target": "white",
            "--stain-blend": "multiply",
            "--stain-opacity": "0.47",
            "--stain-right-opacity": "0.40",
            "--stain-filter": "none"
        },
        dark: {
            "--ink": "#f3eadf",
            "--hover": "#d98e92",
            "--line": "rgba(217, 142, 146, 0.32)",
            "--muted": "rgba(243, 234, 223, 0.65)",
            "--overlay-ink": "#f3eadf",
            "--overlay-backdrop": "rgba(12, 10, 9, 0.82)",
            "--paper-frame-base": "#9a7868",
            "--paper-frame-share": "82%",
            "--paper-highlight": "#8a7165",
            "--toggle-mix-target": "var(--ink)",
            "--stain-blend": "screen",
            "--stain-opacity": "0.24",
            "--stain-right-opacity": "0.22",
            "--stain-filter": "saturate(1.25) brightness(0.74)"
        }
    };

    const STORAGE_KEY = "cabinet-scheme";

    const toRgb = (hex) => [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16)
    ];

    const colorAt = (palette, hour) => {
        const normalizedHour = ((hour % 24) + 24) % 24;
        const endIndex = palette.findIndex(([stop]) => stop >= normalizedHour);
        const [startHour, startHex] = palette[Math.max(0, endIndex - 1)];
        const [endHour, endHex] = palette[endIndex];
        const progress = (normalizedHour - startHour) / (endHour - startHour || 1);
        const start = toRgb(startHex);
        const end = toRgb(endHex);
        const channels = start.map((channel, index) =>
            Math.round(channel + (end[index] - channel) * progress)
        );

        return `rgb(${channels.join(" ")})`;
    };

    const params = new URLSearchParams(location.search);
    const requestedHour = Number.parseFloat(params.get("hour"));
    const requestedScheme = params.get("scheme");
    const preferredScheme = window.matchMedia("(prefers-color-scheme: dark)");

    const readStoredScheme = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === "light" || stored === "dark") {
                return stored;
            }
        } catch {
            // Private mode can block storage.
        }

        return null;
    };

    const writeStoredScheme = (scheme) => {
        try {
            if (scheme === "light" || scheme === "dark") {
                localStorage.setItem(STORAGE_KEY, scheme);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            // Ignore quota / privacy failures.
        }
    };

    let chosenScheme = requestedScheme === "dark" || requestedScheme === "light"
        ? requestedScheme
        : readStoredScheme();

    const activeScheme = () => {
        if (chosenScheme === "dark" || chosenScheme === "light") {
            return chosenScheme;
        }

        return "light";
    };

    const localHour = () => {
        if (Number.isFinite(requestedHour)) {
            return requestedHour;
        }

        const now = new Date();
        return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    };

    const updatePaper = () => {
        const root = document.documentElement;
        const scheme = activeScheme();
        const hour = localHour();

        root.dataset.scheme = scheme;
        root.style.colorScheme = scheme;
        const normalizedHour = ((hour % 24) + 24) % 24;
        const paper = scheme === "light"
            ? (normalizedHour >= 7 && normalizedHour < 19 ? "#f8f1e7" : "#eee9e1")
            : colorAt(palettes.dark, hour);
        root.style.setProperty("--paper", paper);
        Object.entries(themes[scheme]).forEach(([name, value]) => {
            root.style.setProperty(name, value);
        });
    };

    const setScheme = (scheme) => {
        if (scheme !== "light" && scheme !== "dark") {
            return;
        }

        chosenScheme = scheme;
        writeStoredScheme(scheme);
        updatePaper();
    };

    updatePaper();
    window.setInterval(updatePaper, 60_000);

    if (typeof preferredScheme.addEventListener === "function") {
        preferredScheme.addEventListener("change", updatePaper);
    } else if (typeof preferredScheme.addListener === "function") {
        preferredScheme.addListener(updatePaper);
    }

    window.paperTime = {
        setScheme,
        getScheme: activeScheme,
        updatePaper
    };
})();
