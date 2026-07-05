import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Pipette, ChevronDown, RefreshCw, X, Sun, Moon } from "lucide-react";
import { useIsMobile } from "./components/ui/use-mobile";

const PAINT_BRANDS: Record<string, string[]> = {
  Dulux: ["Interior Sheen", "Weathershield", "EasyClean", "Diamond Matt", "Vinyl Matt"],
  "Nippon Paint": ["Momento", "Odour-less All-in-1", "ViNiL Acrylic", "Super Weatherbond", "Medifresh"],
  Jotun: ["Majestic True Beauty", "Sens Interior", "Fenomastic Gorgeous Walls", "Pilot Plus"],
  Kansai: ["Vinilex Nanovoc", "Easyclean Luxe", "Enviro Fresh", "Platone Warna"],
  TOA: ["Platinum Plus", "Supershield Elite", "Durawall Ace", "Freshaire Bio"],
};

const BASE_COLORS = [
  { name: "Titanium White", key: "white", swatch: "#EEECEA", bar: "#a8a8a0" },
  { name: "Vermillion Red",  key: "red",   swatch: "#C83A26", bar: "#C83A26" },
  { name: "Chrome Yellow",  key: "yellow", swatch: "#D4A017", bar: "#D4A017" },
  { name: "Carbon Black",   key: "black",  swatch: "#303030", bar: "#666672" },
];

const PIGMENT_RGB: Record<string, [number, number, number]> = {
  white:  [238, 236, 234],
  red:    [200, 58,  38],
  yellow: [212, 160, 23],
  black:  [36,  36,  36],
};

function computeMixRatios(pr: number, pg: number, pb: number): Record<string, number> {
  const rn = pr / 255, gn = pg / 255, bn = pb / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const white  = Math.pow(min, 0.7) * 0.9;
  const black  = Math.pow(1 - max, 0.7) * 0.9;
  const red    = Math.max(0, rn - (gn + bn) / 2) * 1.6;
  const yellow = Math.max(0, (Math.min(rn, gn) - bn) * 1.4);
  const total  = white + black + red + yellow || 1;
  const norm   = { white: white / total, red: red / total, yellow: yellow / total, black: black / total };
  const s      = Object.values(norm).reduce((acc, v) => acc + v, 0);
  return Object.fromEntries(Object.entries(norm).map(([k, v]) => [k, v / s]));
}

function computeMixColor(vals: Record<string, number>): string {
  const total = Object.values(vals).reduce((acc, v) => acc + v, 0) || 1;
  let mixR = 0, mixG = 0, mixB = 0;
  for (const [key, val] of Object.entries(vals)) {
    const [pr, pg, pb] = PIGMENT_RGB[key] ?? [128, 128, 128];
    mixR += pr * (val / total);
    mixG += pg * (val / total);
    mixB += pb * (val / total);
  }
  return rgbToHex(Math.round(mixR), Math.round(mixG), Math.round(mixB));
}

function colorSimilarity(hex1: string, hex2: string): number {
  const parse = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const dist = Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  return Math.max(0, Math.round(100 - (dist / 441.67) * 100));
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function getLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const SLIDER_MAX = 10;

function RangeSlider({
  value, onChange, barColor, isMobile = false
}: { value: number; onChange: (v: number) => void; barColor: string; isMobile?: boolean }) {
  const pct = (value / SLIDER_MAX) * 100;
  const h       = isMobile ? "36px" : "clamp(16px, 1.3vw, 25px)";
  const trackH  = isMobile ? "16px" : "clamp(4px, 0.36vw, 7px)";
  const thumbW  = isMobile ? "8px" : "clamp(3px, 0.26vw, 5px)";
  const thumbH  = isMobile ? "28px" : "clamp(10px, 0.88vw, 17px)";
  const offset  = `calc(${thumbW} / 2)`;
  return (
    <div className="relative flex items-center flex-1 select-none" style={{ height: h }}>
      <div className="absolute inset-x-0 rounded-full bg-foreground/15" style={{ height: trackH }} />
      <div
        className="absolute left-0 rounded-full"
        style={{ width: `${pct}%`, height: trackH, background: barColor }}
      />
      <div
        className="absolute rounded-full bg-foreground pointer-events-none"
        style={{ left: `calc(${pct}% - ${offset})`, width: thumbW, height: thumbH }}
      />
      <input
        type="range" min={0} max={SLIDER_MAX} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        style={{ height: h }}
      />
    </div>
  );
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedColor, setSelectedColor] = useState<{ r: number; g: number; b: number; hex: string } | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [sliderValues, setSliderValues] = useState({ white: 0, red: 0, yellow: 0, black: 0 });
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set(["Dulux"]));
  const [selectedSubCollections, setSelectedSubCollections] = useState<Record<string, Set<string>>>({});
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [activeTab, setActiveTab] = useState<"suggested" | "formula">("suggested");

  const isMobile = useIsMobile();

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgRef       = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef      = useRef(1);
  const panRef       = useRef({ x: 0, y: 0 });
  const isPanning    = useRef(false);
  const lastMouse    = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef(1);
  const touchStartPan  = useRef({ x: 0, y: 0 });
  const touchStartMid  = useRef({ x: 0, y: 0 });
  const touchStartZoom = useRef(1);

  const hasColor = selectedColor !== null;
  const mixResultHex = hasColor ? computeMixColor(sliderValues) : null;
  const similarity   = hasColor && mixResultHex ? colorSimilarity(selectedColor.hex, mixResultHex) : null;

  const redraw = useCallback((z: number, px: number, py: number, currentPixel = selectedPixel) => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = Math.floor(img.naturalWidth * z);
    canvas.height = Math.floor(img.naturalHeight * z);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (currentPixel) {
      const rx = currentPixel.x * z;
      const ry = currentPixel.y * z;
      
      // Draw reticle target
      ctx.beginPath();
      ctx.arc(rx, ry, 14, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rx, ry, 14, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }, [selectedPixel]);

  // Keep canvas position in sync with panRef
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
  }, [pan]);

  useEffect(() => {
    if (!image) {
      setSelectedColor(null);
      setSelectedPixel(null);
      setSliderValues({ white: 0, red: 0, yellow: 0, black: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      let initialZoom = 1;
      if (isMobile) {
        const zoomX = rect.width / img.naturalWidth;
        const zoomY = rect.height / img.naturalHeight;
        initialZoom = Math.min(zoomX, zoomY, 1);
      }
      
      zoomRef.current = initialZoom;
      setZoom(initialZoom);

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(img.naturalWidth * initialZoom);
      canvas.height = Math.floor(img.naturalHeight * initialZoom);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }

      const cx = Math.max(0, (rect.width - canvas.width) / 2);
      const cy = Math.max(0, (rect.height - canvas.height) / 2);
      panRef.current = { x: cx, y: cy };
      setPan({ x: cx, y: cy });
      canvas.style.transform = `translate(${cx}px, ${cy}px)`;
    };
    img.src = image;
  }, [image, isMobile]);

  // Redraw canvas when pixel or zoom changes
  useEffect(() => {
    if (image && imgRef.current) {
      redraw(zoom, panRef.current.x, panRef.current.y);
    }
  }, [selectedPixel, zoom, image, redraw]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const canvasCb = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!imgRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const step = 0.15;
      const next = e.deltaY < 0 ? zoomRef.current + step : zoomRef.current - step;
      const clamped = Math.min(Math.max(next, 0.6), 2.5);
      zoomRef.current = clamped;
      setZoom(clamped);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const getCanvasXY = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    return { cx, cy };
  };

  const pickColorFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    
    const imgX = Math.floor(relX * img.naturalWidth);
    const imgY = Math.floor(relY * img.naturalHeight);
    
    if (imgX < 0 || imgY < 0 || imgX >= img.naturalWidth || imgY >= img.naturalHeight) return;
    
    const offscreen = document.createElement("canvas");
    offscreen.width = 1;
    offscreen.height = 1;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(img, imgX, imgY, 1, 1, 0, 0, 1, 1);
    const px = ctx.getImageData(0, 0, 1, 1).data;
    const [pixR, pixG, pixB] = [px[0], px[1], px[2]];
    
    setSelectedColor({ r: pixR, g: pixG, b: pixB, hex: rgbToHex(pixR, pixG, pixB) });
    setSelectedPixel({ x: imgX, y: imgY });
    
    const ratios = computeMixRatios(pixR, pixG, pixB);
    setSliderValues({
      white:  Math.round((ratios.white  ?? 0) * SLIDER_MAX),
      red:    Math.round((ratios.red    ?? 0) * SLIDER_MAX),
      yellow: Math.round((ratios.yellow ?? 0) * SLIDER_MAX),
      black:  Math.round((ratios.black  ?? 0) * SLIDER_MAX),
    });
  };

  const pickColorFromClientCoords = (clientX: number, clientY: number) => {
    pickColorFromClient(clientX, clientY);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    pickColorFromClient(e.clientX, e.clientY);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      setPanning(true);
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setHoverColor(null);
      setHoverPos(null);
    }
  };

  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy };
      setPan(panRef.current);
      if (canvasRef.current) {
        canvasRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px)`;
      }
    };
    const mu = () => { isPanning.current = false; setPanning(false); };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
    return () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
  }, []);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) return;
    const pos = getCanvasXY(e);
    if (!pos) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const ix = Math.floor(pos.cx);
    const iy = Math.floor(pos.cy);
    const pw = canvas.width, ph = canvas.height;
    if (ix < 0 || iy < 0 || ix >= pw || iy >= ph) {
      setHoverColor(null);
      setHoverPos(null);
      return;
    }
    const hpx = ctx.getImageData(ix, iy, 1, 1).data;
    setHoverColor(rgbToHex(hpx[0], hpx[1], hpx[2]));
    setHoverPos({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasMouseLeave = () => {
    setHoverColor(null);
    setHoverPos(null);
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
    // No auto-selection of sub collections
  };

  const toggleSubCollection = (brand: string, sub: string) => {
    setSelectedSubCollections(prev => {
      const current = new Set(prev[brand] ?? PAINT_BRANDS[brand]);
      if (current.has(sub)) current.delete(sub);
      else current.add(sub);
      return { ...prev, [brand]: current };
    });
  };

  const getAllSelectedSubs = (brand: string) => {
    return selectedSubCollections[brand] ?? new Set<string>();
  };

  const targetTextColor = selectedColor && getLuminance(selectedColor.hex) > 0.35 ? "#111113" : "#f0f0f4";
  const mixTextColor    = mixResultHex && getLuminance(mixResultHex) > 0.35 ? "#111113" : "#f0f0f4";

  const sideW        = "clamp(280px, 20.83vw, 400px)";
  const panelPx      = "clamp(12px, 0.99vw, 15px)";
  const sectionMb    = "clamp(9px, 0.89vw, 16px)";
  const sectionFs    = "clamp(10px, 0.52vw, 12px)";
  const panelGap     = "clamp(7px, 0.73vw, 12px)";
  const labelFs      = "clamp(11px, 0.63vw, 13px)";
  const labelMb      = "clamp(4px, 0.36vw, 6px)";
  const selectPy     = "clamp(6px, 0.62vw, 10px)";
  const selectPx     = "clamp(7px, 0.73vw, 12px)";
  const selectFs     = "clamp(12px, 0.78vw, 15px)";
  const chevronSz    = "clamp(8px, 0.68vw, 12px)";
  const previewH     = "clamp(100px, 12vh, 150px)";
  const previewMb    = "clamp(7px, 0.73vw, 12px)";
  const mixFs        = "clamp(10px, 0.52vw, 12px)";
  const mixGap       = "clamp(5px, 0.47vw, 8px)";
  const mixPt        = "clamp(7px, 0.73vw, 12px)";
  const pillPy       = "clamp(2px, 0.13vw, 3px)";
  const pillPx       = "clamp(5px, 0.47vw, 8px)";
  const hexFs        = "clamp(9px, 0.47vw, 11px)";
  const hexOff       = "clamp(7px, 0.73vw, 12px)";
  const targetPt     = "clamp(6px, 0.62vw, 10px)";
  const xBtnSz       = "clamp(14px, 0.99vw, 18px)";
  const xIconSz      = "clamp(6px, 0.47vw, 8px)";
  const ingMb        = "clamp(7px, 0.68vw, 12px)";
  const ingGap       = "clamp(6px, 0.57vw, 10px)";
  const ingPt        = "clamp(9px, 0.83vw, 14px)";
  const ingPb        = "clamp(6px, 0.57vw, 10px)";
  const swatchSz     = "clamp(34px, 2.6vw, 48px)";
  const ingFs        = "clamp(12px, 0.78vw, 15px)";
  const ingXSz       = "clamp(24px, 2.08vw, 38px)";
  const ingXIcSz     = "clamp(8px, 0.68vw, 12px)";
  const pillWSz      = "clamp(28px, 2.34vw, 44px)";
  const pillHSz      = "clamp(20px, 1.72vw, 34px)";
  const pillFs       = "clamp(10px, 0.52vw, 12px)";
  const emptyH       = "clamp(48px, 3.9vw, 62px)";
  const emptyFs      = "clamp(10px, 0.57vw, 12px)";
  const hoverGap     = "clamp(6px, 0.73vw, 12px)";
  const hoverPy      = "clamp(5px, 0.47vw, 8px)";
  const hoverPx      = "clamp(7px, 0.83vw, 13px)";
  const hoverBr      = "clamp(6px, 0.62vw, 10px)";
  const hoverFs      = "clamp(11px, 0.68vw, 14px)";
  const hoverSwSz    = "clamp(26px, 2.34vw, 44px)";
  const hoverSwBw    = "clamp(1.5px, 0.1vw, 2px)";
  const uploadIcCtSz = "clamp(40px, 3.12vw, 56px)";
  const uploadIconSz = "clamp(15px, 1.2vw, 21px)";
  const uploadGap    = "clamp(12px, 1.2vw, 20px)";
  const uploadPy     = "clamp(60px, 7.8vw, 160px)";
  const uploadTitleFs= "clamp(12px, 0.78vw, 15px)";
  const uploadSubFs  = "clamp(11px, 0.57vw, 13px)";

  // ─── Mobile portrait layout ───
  if (isMobile) {
    return (
      <>
        {/* Landscape Lock Warning */}
        <div className="landscape-lock-warning font-sans">
          <p className="font-semibold text-sm tracking-wide">Hãy xoay dọc màn hình.</p>
        </div>

        <div className="app-container h-[100dvh] w-screen flex flex-col overflow-hidden bg-background text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
          {/* Fixed Top Area (45vh) */}
          <div 
            ref={containerRef}
            className="h-[45vh] w-full relative overflow-hidden bg-muted flex items-center justify-center shrink-0 border-b border-border select-none"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            {!image ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl transition-all duration-200 w-[85%] py-8 ${
                  isDragging
                    ? "border-[#ff0052]/60 bg-[#ff0052]/5"
                    : "border-foreground/10 bg-foreground/[0.015]"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-foreground/[0.05] flex items-center justify-center">
                  <Upload className="text-foreground/50 w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground/75 text-xs">Kéo thả hoặc click để upload ảnh</p>
                  <p className="text-foreground/45 text-[10px] mt-1">Hỗ trợ JPG, JPEG, PNG, WEBP</p>
                </div>
              </button>
            ) : (
              <div className="absolute inset-0">
                <button
                  onClick={() => { setImage(null); setSelectedColor(null); setSelectedPixel(null); }}
                  className="absolute top-3 left-3 z-40 w-8 h-8 rounded-full flex items-center justify-center bg-black/60 border border-white/10 hover:bg-black/80 transition-colors shadow"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <canvas
                  ref={canvasCb}
                  onClick={handleCanvasClick}
                  onTouchStart={(e) => {
                    if (e.touches.length === 1) {
                      e.preventDefault();
                      pickColorFromClientCoords(e.touches[0].clientX, e.touches[0].clientY);
                    } else if (e.touches.length === 2) {
                      e.preventDefault();
                      const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                      );
                      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                      touchStartDist.current = dist || 1;
                      touchStartPan.current = { ...panRef.current };
                      touchStartMid.current = { x: midX, y: midY };
                      touchStartZoom.current = zoomRef.current;
                    }
                  }}
                  onTouchMove={(e) => {
                    if (e.touches.length === 1) {
                      e.preventDefault();
                      pickColorFromClientCoords(e.touches[0].clientX, e.touches[0].clientY);
                    } else if (e.touches.length === 2) {
                      e.preventDefault();
                      const dist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                      );
                      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                      
                      const scale = dist / touchStartDist.current;
                      const nextZoom = Math.min(Math.max(touchStartZoom.current * scale, 0.4), 3.0);
                      zoomRef.current = nextZoom;
                      setZoom(nextZoom);
                      
                      const dx = midX - touchStartMid.current.x;
                      const dy = midY - touchStartMid.current.y;
                      const nextPan = { x: touchStartPan.current.x + dx, y: touchStartPan.current.y + dy };
                      panRef.current = nextPan;
                      setPan(nextPan);
                      if (canvasRef.current) {
                        canvasRef.current.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px)`;
                      }
                    }
                  }}
                  className="block"
                  style={{ cursor: "crosshair", userSelect: "none", touchAction: "none" }}
                />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
          </div>

          {/* Scrollable Bottom Sheet Area (55vh) */}
          <div className="h-[55vh] w-full flex flex-col bg-background border-t border-border rounded-t-2xl shadow-xl overflow-hidden relative">
            {/* Drag handle */}
            <div className="flex justify-center py-3 shrink-0 select-none">
              <div className="w-12 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Sidebar content */}
            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
              {/* Color Preview Block */}
              <div className="relative shrink-0 w-full" style={{ height: previewH, marginBottom: previewMb }}>
                <div className="absolute right-0 rounded-2xl border border-foreground/[0.09] overflow-hidden transition-colors duration-400"
                  style={{ background: mixResultHex ?? "var(--popover)", top: "0%", bottom: "-10%", left: "28%" }}>
                  {hasColor && (
                    <div className="flex items-center justify-end" style={{ gap: mixGap, padding: `${mixPt} ${mixPt} 0 ${mixPt}` }}>
                      <span className="font-medium" style={{ color: mixTextColor, opacity: 0.65, fontSize: mixFs }}>Mix Result</span>
                      {similarity !== null && (
                        <span className="font-semibold rounded-full" style={{ background: "rgba(0,0,0,0.25)", color: mixTextColor, fontFamily: "'JetBrains Mono', monospace", fontSize: mixFs, padding: `${pillPy} ${pillPx}` }}>{similarity}%</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="absolute left-0 rounded-2xl border border-foreground/[0.14] overflow-hidden z-10 transition-colors duration-300"
                  style={{ background: selectedColor?.hex ?? "var(--card)", top: "10%", bottom: 0, width: "56%" }}>
                  {selectedColor && (
                    <button onClick={() => { setSelectedColor(null); setSelectedPixel(null); setSliderValues({ white: 0, red: 0, yellow: 0, black: 0 }); }}
                      className="absolute top-2 right-2 z-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md"
                      style={{
                        width: "clamp(20px, 1.56vw, 28px)",
                        height: "clamp(20px, 1.56vw, 28px)",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        opacity: 0.7,
                      }}>
                      <X style={{ color: "#fff", width: "clamp(10px, 0.68vw, 14px)", height: "clamp(10px, 0.68vw, 14px)" }} />
                    </button>
                  )}
                  <div className="flex items-start" style={{ padding: `${targetPt} ${mixPt} 0 ${mixPt}` }}>
                  </div>
                </div>
              </div>

              {/* Brand selection */}
              <div className="space-y-3">
                <div>
                  <label className="block text-foreground/60 text-[10px] font-bold tracking-wider mb-1">HÃNG</label>
                  <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar gap-2 py-1 px-4 -mx-4 select-none whitespace-nowrap">
                    {Object.keys(PAINT_BRANDS).map(brand => {
                      const isSelected = selectedBrands.has(brand);
                      return (
                        <button 
                          key={brand} 
                          onClick={() => toggleBrand(brand)} 
                          className="rounded-full transition-all duration-200 shrink-0 px-4 py-1.5 text-xs font-medium"
                          style={{ 
                            background: isSelected ? "#ff0052" : "var(--ingredient-card)", 
                            color: isSelected ? "#fff" : "var(--color-foreground)", 
                            opacity: isSelected ? 1 : 0.65 
                          }}
                        >
                          {brand}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {Array.from(selectedBrands).map(brand => {
                  const subs = PAINT_BRANDS[brand];
                  const selectedSubs = getAllSelectedSubs(brand);
                  const allSelected = subs.every(s => selectedSubs.has(s));
                  return (
                    <div key={brand} className="space-y-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-foreground/60 text-[10px] font-bold tracking-wider uppercase">{brand} · Dòng màu</label>
                        <button 
                          onClick={() => { setSelectedSubCollections(prev => ({ ...prev, [brand]: allSelected ? new Set<string>() : new Set(subs) })); }}
                          style={{ fontSize: "10px", color: "var(--color-foreground)", opacity: 0.5, cursor: "pointer", background: "none", border: "none", padding: 0 }}
                        >
                          {allSelected ? "Bỏ chọn" : "Chọn hết"}
                        </button>
                      </div>
                      <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar gap-2 py-1 px-4 -mx-4 select-none whitespace-nowrap">
                        {subs.map(sub => {
                          const checked = selectedSubs.has(sub);
                          return (
                            <button 
                              key={sub} 
                              onClick={() => toggleSubCollection(brand, sub)} 
                              className="rounded-full transition-all duration-200 shrink-0 px-3.5 py-1.5 text-[10px] font-medium"
                              style={{ 
                                background: checked ? "rgba(255,0,82,0.15)" : "var(--ingredient-card)", 
                                color: checked ? "#ff0052" : undefined, 
                                border: `1px solid ${checked ? "rgba(255,0,82,0.25)" : "transparent"}`, 
                                opacity: checked ? 1 : 0.6 
                              }}
                            >
                              {checked ? "✓ " : ""}{sub}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tab bar */}
              <div className="flex rounded-lg overflow-hidden border border-foreground/[0.08]">
                {(["suggested", "formula"] as const).map(tab => (
                  <button 
                    key={tab} 
                    onClick={() => setActiveTab(tab)} 
                    className="flex-1 text-center py-2 transition-all duration-200 font-semibold"
                    style={{ 
                      fontSize: "11px", 
                      fontFamily: "'JetBrains Mono', monospace", 
                      background: activeTab === tab ? "#ff0052" : "transparent", 
                      color: activeTab === tab ? "#fff" : "var(--color-foreground)", 
                      opacity: activeTab === tab ? 1 : 0.45, 
                      letterSpacing: "0.05em" 
                    }}
                  >
                    {tab === "suggested" ? "Đề xuất" : "Công thức"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "suggested" ? (
                <div className="flex items-center justify-center py-8" />
              ) : (
                <div className="flex flex-col gap-3">
                  {BASE_COLORS.map(({ name, key, swatch, bar }) => {
                    const rawVal = sliderValues[key as keyof typeof sliderValues] ?? 0;
                    return hasColor ? (
                      <div key={key} className="rounded-xl overflow-hidden border border-foreground/[0.07] w-full" style={{ background: "var(--ingredient-card)" }}>
                        <div className="flex items-center gap-3 p-3 pb-1">
                          <div className="rounded-lg shrink-0 border border-foreground/10 w-9 h-9" style={{ background: swatch }} />
                          <span className="flex-1 text-foreground/90 font-semibold text-[11px] leading-tight">{name}</span>
                          <button 
                            className="bg-foreground/10 hover:bg-foreground/20 rounded-lg w-7 h-7 flex items-center justify-center shrink-0 transition-colors" 
                            onClick={() => setSliderValues(prev => ({ ...prev, [key]: 0 }))}
                          >
                            <X className="text-foreground/70 w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 px-3 pb-3">
                          <RangeSlider value={rawVal} barColor={bar} onChange={(v) => setSliderValues(prev => ({ ...prev, [key]: v }))} isMobile={true} />
                          <div className="rounded-xl flex items-center justify-center shrink-0 bg-background/80 border border-border w-12 h-8">
                            <span className="text-foreground/95 font-mono text-xs font-extrabold">{rawVal}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={key} className="rounded-xl border-2 border-dashed border-foreground/[0.09] flex items-center justify-center w-full h-12">
                        <span className="text-foreground/35 text-[10px] font-bold uppercase tracking-wider">Thành phần</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer controls: Dark mode */}
            <div className="border-t border-border shrink-0 flex items-center justify-center py-2.5 bg-background/50">
              <button onClick={() => setIsDarkMode(prev => !prev)} className="relative rounded-full transition-colors duration-300"
                style={{ width: 44, height: 24, background: isDarkMode ? "#3a3a42" : "#ff0052", border: "none", cursor: "pointer" }}>
                <div className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{ width: 18, height: 18, left: isDarkMode ? 3 : "calc(100% - 21px)", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
                  {isDarkMode ? <Moon style={{ width: 10, height: 10, color: "#5a5a66" }} /> : <Sun style={{ width: 10, height: 10, color: "#ff0052" }} />}
                </div>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Landscape Lock Warning */}
      <div className="landscape-lock-warning font-sans">
        <p className="font-semibold text-sm tracking-wide">Hãy xoay dọc màn hình.</p>
      </div>

      <div className="app-container h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="flex flex-1 min-h-0">
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            {!image ? (
              <div className="w-full h-full flex items-center justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center border-2 border-dashed rounded-2xl transition-all duration-200 w-[80%] max-w-[60vw] ${
                    isDragging
                      ? "border-[#ff0052]/60 bg-[#ff0052]/5"
                      : "border-foreground/10 bg-foreground/[0.015] hover:border-foreground/20 hover:bg-foreground/[0.03]"
                  }`}
                  style={{ gap: uploadGap, paddingTop: uploadPy, paddingBottom: uploadPy }}
                >
                  <div className="rounded-xl bg-foreground/[0.05] flex items-center justify-center" style={{ width: uploadIcCtSz, height: uploadIcCtSz }}>
                    <Upload className="text-foreground/50" style={{ width: uploadIconSz, height: uploadIconSz }} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground/75" style={{ fontSize: uploadTitleFs }}>Kéo thả hoặc click để upload ảnh</p>
                    <p className="text-foreground/45" style={{ fontSize: uploadSubFs }}>Hỗ trợ JPG, JPEG, PNG, WEBP</p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="absolute inset-0">
                <button
                  onClick={() => setImage(null)}
                  className="absolute top-3 left-3 z-40 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:opacity-100"
                  style={{
                    width: "clamp(22px, 1.56vw, 28px)",
                    height: "clamp(22px, 1.56vw, 28px)",
                    background: isDarkMode ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.70)",
                    backdropFilter: "blur(8px)",
                    border: isDarkMode ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(0,0,0,0.15)",
                    opacity: 0.65,
                    color: isDarkMode ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)",
                  }}
                >
                  <X style={{ width: "clamp(10px, 0.68vw, 13px)", height: "clamp(10px, 0.68vw, 13px)", opacity: 0.75 }} />
                </button>
                <canvas
                  ref={canvasCb}
                  onClick={handleCanvasClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={handleCanvasMouseLeave}
                  className="block"
                  style={{ cursor: panning ? "grabbing" : "crosshair", userSelect: "none" }}
                />
                {hoverPos && hoverColor && (
                  <div
                    className="fixed pointer-events-none flex items-center shadow-xl border border-white/15 rounded-lg z-50"
                    style={{
                      left: `${hoverPos.x + 16}px`,
                      top: `${hoverPos.y + 16}px`,
                      padding: "4px",
                      background: "rgba(12,12,14,0.85)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <div className="rounded" style={{ width: hoverSwSz, height: hoverSwSz, background: hoverColor, border: `${hoverSwBw} solid rgba(255,255,255,0.2)` }} />
                  </div>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <aside className="flex flex-col border-l border-border shrink-0 overflow-hidden" style={{ width: sideW }}>
            <div className="border-b border-border shrink-0 overflow-y-auto" style={{ padding: panelPx, maxHeight: "40%" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: panelGap }}>
                <div>
                  <label className="block text-foreground/60" style={{ fontSize: labelFs, marginBottom: labelMb }}>HÃNG</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(4px, 0.36vw, 6px)" }}>
                    {Object.keys(PAINT_BRANDS).map(brand => {
                      const isSelected = selectedBrands.has(brand);
                      return (
                        <button key={brand} onClick={() => toggleBrand(brand)} className="rounded-full transition-all duration-200"
                          style={{ padding: "clamp(3px, 0.31vw, 5px) clamp(8px, 0.68vw, 12px)", fontSize: "clamp(10px, 0.57vw, 11px)", background: isSelected ? "#ff0052" : "var(--ingredient-card)", color: isSelected ? "#fff" : "var(--color-foreground)", border: `1px solid ${isSelected ? "#ff0052" : "transparent"}`, opacity: isSelected ? 1 : 0.55 }}>
                          {brand}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {Array.from(selectedBrands).map(brand => {
                  const subs = PAINT_BRANDS[brand];
                  const selectedSubs = getAllSelectedSubs(brand);
                  const allSelected = subs.every(s => selectedSubs.has(s));
                  return (
                    <div key={brand}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: labelMb }}>
                        <label className="block text-foreground/60" style={{ fontSize: labelFs }}>{brand} · DÒNG MÀU</label>
                        <button onClick={() => { setSelectedSubCollections(prev => ({ ...prev, [brand]: allSelected ? new Set<string>() : new Set(subs) })); }}
                          style={{ fontSize: "clamp(9px, 0.47vw, 10px)", color: "var(--color-foreground)", opacity: 0.5, cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(3px, 0.26vw, 5px)" }}>
                        {subs.map(sub => {
                          const checked = selectedSubs.has(sub);
                          return (
                            <button key={sub} onClick={() => toggleSubCollection(brand, sub)} className="rounded-full transition-all duration-200"
                              style={{ padding: "clamp(2px, 0.21vw, 4px) clamp(6px, 0.52vw, 10px)", fontSize: "clamp(9px, 0.47vw, 10px)", background: checked ? "rgba(255,0,82,0.15)" : "var(--ingredient-card)", color: checked ? "#ff0052" : undefined, border: `1px solid ${checked ? "rgba(255,0,82,0.25)" : "transparent"}`, opacity: checked ? 1 : 0.5 }}>
                              {checked ? "✓ " : ""}{sub}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-b border-border shrink-0" style={{ padding: panelPx }}>
              <div className="relative" style={{ height: previewH, marginBottom: previewMb }}>
                <div className="absolute right-0 rounded-2xl border border-foreground/[0.09] overflow-hidden transition-colors duration-400"
                  style={{ background: mixResultHex ?? "var(--popover)", top: "0%", bottom: "-10%", left: "28%" }}>
                  {hasColor && (
                    <div className="flex items-center justify-end" style={{ gap: mixGap, padding: `${mixPt} ${mixPt} 0 ${mixPt}` }}>
                      <span className="font-medium" style={{ color: mixTextColor, opacity: 0.65, fontSize: mixFs }}>Mix Result</span>
                      {similarity !== null && (
                        <span className="font-semibold rounded-full" style={{ background: "rgba(0,0,0,0.25)", color: mixTextColor, fontFamily: "'JetBrains Mono', monospace", fontSize: mixFs, padding: `${pillPy} ${pillPx}` }}>{similarity}%</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="absolute left-0 rounded-2xl border border-foreground/[0.14] overflow-hidden z-10 transition-colors duration-300"
                  style={{ background: selectedColor?.hex ?? "var(--card)", top: "10%", bottom: 0, width: "56%" }}>
                  {selectedColor && (
                    <button onClick={() => { setSelectedColor(null); setSelectedPixel(null); setSliderValues({ white: 0, red: 0, yellow: 0, black: 0 }); }}
                      className="absolute top-2 right-2 z-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md"
                      style={{
                        width: "clamp(20px, 1.56vw, 28px)",
                        height: "clamp(20px, 1.56vw, 28px)",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        opacity: 0.7,
                      }}>
                      <X style={{ color: "#fff", width: "clamp(10px, 0.68vw, 14px)", height: "clamp(10px, 0.68vw, 14px)" }} />
                    </button>
                  )}
                  <div className="flex items-start" style={{ padding: `${targetPt} ${mixPt} 0 ${mixPt}` }}>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col" style={{ padding: panelPx }}>
              {/* Tab bar */}
              <div className="flex shrink-0 rounded-lg overflow-hidden border border-foreground/[0.08] mb-4" style={{ marginBottom: ingMb }}>
                {(["suggested", "formula"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex-1 text-center py-2 transition-all duration-200"
                    style={{
                      fontSize: "clamp(10px, 0.57vw, 12px)",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 500,
                      background: activeTab === tab ? "#ff0052" : "transparent",
                      color: activeTab === tab ? "#fff" : "var(--color-foreground)",
                      opacity: activeTab === tab ? 1 : 0.45,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {tab === "suggested" ? "MÀU ĐỀ XUẤT" : "CÔNG THỨC"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "suggested" ? (
                <div className="flex-1 flex items-center justify-center">
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: ingGap, overflowY: "auto", flex: 1 }}>
                  {BASE_COLORS.map(({ name, key, swatch, bar }) => {
                    const rawVal = sliderValues[key as keyof typeof sliderValues] ?? 0;
                    return hasColor ? (
                      <div key={key} className="rounded-xl overflow-hidden border border-foreground/[0.07] shrink-0" style={{ background: "var(--ingredient-card)", backdropFilter: "blur(4px)" }}>
                        <div className="flex items-center" style={{ gap: ingGap, padding: `${ingPt} ${ingPt} ${ingPb} ${ingPt}` }}>
                          <div className="rounded-lg shrink-0 border border-foreground/10" style={{ width: swatchSz, height: swatchSz, background: swatch }} />
                          <span className="flex-1 text-foreground/90 leading-tight" style={{ fontSize: ingFs }}>{name}</span>
                          <button className="bg-foreground/15 rounded-lg flex items-center justify-center shrink-0 hover:bg-foreground/25 transition-colors" style={{ width: ingXSz, height: ingXSz }} onClick={() => setSliderValues(prev => ({ ...prev, [key]: 0 }))}>
                            <X className="text-foreground/70" style={{ width: ingXIcSz, height: ingXIcSz }} />
                          </button>
                        </div>
                        <div className="flex items-center" style={{ gap: ingGap, padding: `0 ${ingPt} ${ingPt} ${ingPt}` }}>
                          <RangeSlider value={rawVal} barColor={bar} onChange={(v) => setSliderValues(prev => ({ ...prev, [key]: v }))} />
                          <div className="rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.10)", width: pillWSz, height: pillHSz }}>
                            <span className="text-foreground/80" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: pillFs }}>{rawVal}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={key} className="rounded-xl border-2 border-dashed border-foreground/[0.09] flex items-center justify-center shrink-0" style={{ height: emptyH }}>
                        <span className="text-foreground/35" style={{ fontSize: emptyFs }}>THÀNH PHẦN</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border shrink-0 flex items-center justify-center" style={{ padding: "clamp(6px, 0.52vw, 10px) clamp(10px, 0.83vw, 16px)" }}>
              <button onClick={() => setIsDarkMode(prev => !prev)} className="relative rounded-full transition-colors duration-300"
                style={{ width: "clamp(40px, 3.12vw, 56px)", height: "clamp(22px, 1.72vw, 30px)", background: isDarkMode ? "#3a3a42" : "#ff0052", border: "none", cursor: "pointer" }}>
                <div className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{ width: "clamp(17px, 1.3vw, 24px)", height: "clamp(17px, 1.3vw, 24px)", left: isDarkMode ? "clamp(3px, 0.23vw, 4px)" : "calc(100% - clamp(20px, 1.56vw, 28px))", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }}>
                  {isDarkMode ? <Moon style={{ width: "clamp(9px, 0.68vw, 13px)", height: "clamp(9px, 0.68vw, 13px)", color: "#5a5a66" }} /> : <Sun style={{ width: "clamp(9px, 0.68vw, 13px)", height: "clamp(9px, 0.68vw, 13px)", color: "#ff0052" }} />}
                </div>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}