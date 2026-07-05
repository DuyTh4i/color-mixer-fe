import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, Sun, Moon } from "lucide-react";
import { useIsMobile } from "./components/ui/use-mobile";

// ─── Types ───
interface Subcollection {
  id: string;
  name: string;
  product_img: string;
}

interface Brand {
  id: string;
  name: string;
  logo: string;
  subcollections: Subcollection[];
}

// ─── API base URL from env ───
const API_BASE =
  import.meta.env.VITE_API_PROD_URL ||
  import.meta.env.VITE_API_TEST_URL ||
  "http://127.0.0.1:8000/api/v1";

// ─── API key from env (must have VITE_ prefix to be exposed by Vite) ───
const API_KEY = import.meta.env.VITE_INTERNAL_API_KEY ?? "";

// ─── Helpers ───
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function getLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export default function App() {
  // ─── Image / Canvas state ───
  const [image, setImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedColor, setSelectedColor] = useState<{ r: number; g: number; b: number; hex: string } | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  // ─── Brand / Subcollection state ───
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());

  // ─── Recipe state ───
  const [recipeResult, setRecipeResult] = useState<any>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);

  // ─── UI state ───
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"suggested" | "formula">("suggested");

  const isMobile = useIsMobile();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef(1);
  const touchStartPan = useRef({ x: 0, y: 0 });
  const touchStartMid = useRef({ x: 0, y: 0 });
  const touchStartZoom = useRef(1);

  const hasColor = selectedColor !== null;

  // ─── Fetch brands on mount ───
  useEffect(() => {
    let cancelled = false;
    async function fetchBrands() {
      setBrandsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/brands`, {
          headers: { "X-API-KEY": API_KEY },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Brand[] = await res.json();
        if (!cancelled) {
          setBrands(data);
          if (data.length > 0 && selectedBrandIds.size === 0) {
            setSelectedBrandIds(new Set([data[0].id]));
          }
        }
      } catch (err) {
        console.error("Failed to fetch brands:", err);
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    }
    fetchBrands();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fetch recipe when color is picked ───
  useEffect(() => {
    if (!selectedColor || selectedSubIds.size === 0) {
      setRecipeResult(null);
      return;
    }
    let cancelled = false;
    async function fetchRecipe() {
      setRecipeLoading(true);
      try {
        const res = await fetch(`${API_BASE}/recipes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": API_KEY,
          },
          body: JSON.stringify({
            hex_value: selectedColor!.hex,
            subcollection_ids: Array.from(selectedSubIds),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRecipeResult(data);
      } catch (err) {
        console.error("Failed to fetch recipe:", err);
      } finally {
        if (!cancelled) setRecipeLoading(false);
      }
    }
    fetchRecipe();
    return () => { cancelled = true; };
  }, [selectedColor, selectedSubIds]);

  // ─── Canvas / Image logic ───
  const redraw = useCallback(
    (z: number, _px: number, _py: number, currentPixel = selectedPixel) => {
      const canvas = canvasRef.current,
        img = imgRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(img.naturalWidth * z);
      canvas.height = Math.floor(img.naturalHeight * z);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (currentPixel) {
        const rx = currentPixel.x * z;
        const ry = currentPixel.y * z;
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
    },
    [selectedPixel],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
  }, [pan]);

  useEffect(() => {
    if (!image) {
      setSelectedColor(null);
      setSelectedPixel(null);
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
    const canvas = canvasRef.current,
      img = imgRef.current;
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
    const mu = () => {
      isPanning.current = false;
      setPanning(false);
    };
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
    const pw = canvas.width,
      ph = canvas.height;
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

  // ─── Brand / Sub selection helpers ───
  const toggleBrand = (brandId: string) => {
    setSelectedBrandIds((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) {
        next.delete(brandId);
        setSelectedSubIds((subPrev) => {
          const brand = brands.find((b) => b.id === brandId);
          if (!brand) return subPrev;
          const filtered = new Set(subPrev);
          brand.subcollections.forEach((s) => filtered.delete(s.id));
          return filtered;
        });
      } else {
        next.add(brandId);
      }
      return next;
    });
  };

  const toggleSubCollection = (subId: string) => {
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const toggleAllSubsForBrand = (brand: Brand) => {
    const allIds = brand.subcollections.map((s) => s.id);
    const allSelected = allIds.every((id) => selectedSubIds.has(id));
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // ─── Style constants ───
  const sideW = "clamp(300px, 22vw, 420px)";
  const panelPx = "clamp(14px, 1.1vw, 17px)";
  const panelGap = "clamp(9px, 0.85vw, 14px)";
  const labelFs = "clamp(13px, 0.75vw, 15px)";
  const labelMb = "clamp(5px, 0.42vw, 7px)";
  const previewH = "clamp(110px, 13vh, 160px)";
  const previewMb = "clamp(8px, 0.8vw, 13px)";
  const mixFs = "clamp(12px, 0.65vw, 14px)";
  const mixGap = "clamp(6px, 0.55vw, 9px)";
  const mixPt = "clamp(8px, 0.8vw, 13px)";
  const targetPt = "clamp(7px, 0.7vw, 11px)";
  const ingMb = "clamp(8px, 0.75vw, 13px)";
  const ingGap = "clamp(7px, 0.65vw, 11px)";
  const emptyH = "clamp(54px, 4.2vw, 68px)";
  const hoverSwSz = "clamp(30px, 2.6vw, 48px)";
  const hoverSwBw = "clamp(2px, 0.12vw, 2.5px)";
  const uploadIcCtSz = "clamp(44px, 3.4vw, 60px)";
  const uploadIconSz = "clamp(17px, 1.4vw, 23px)";
  const uploadGap = "clamp(14px, 1.4vw, 22px)";
  const uploadPy = "clamp(70px, 8.5vw, 170px)";
  const uploadTitleFs = "clamp(14px, 0.9vw, 17px)";
  const uploadSubFs = "clamp(13px, 0.68vw, 15px)";

  const mixResultHex = recipeResult?.mix_hex ?? null;
  const mixTextColor = mixResultHex && getLuminance(mixResultHex) > 0.35 ? "#111113" : "#f0f0f4";

  // ─── Desktop brand section ───
  const renderBrandSection = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: panelGap }}>
      <div>
        <label className="block text-foreground/60" style={{ fontSize: labelFs, marginBottom: labelMb }}>
          HÃNG
        </label>
        {brandsLoading ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-full animate-pulse bg-foreground/10 h-8" style={{ width: "90px" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(5px, 0.42vw, 7px)" }}>
            {brands.map((brand) => {
              const isSelected = selectedBrandIds.has(brand.id);
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  className="rounded-lg transition-all duration-200 flex items-center gap-1"
                  style={{
                    padding: "clamp(4px, 0.26vw, 5px) clamp(10px, 0.65vw, 12px)",
                    fontSize: "clamp(12px, 0.7vw, 14px)",
                    background: isSelected ? "#ff0052" : "var(--ingredient-card)",
                    color: isSelected ? "#fff" : "var(--color-foreground)",
                    border: `1px solid ${isSelected ? "#ff0052" : "transparent"}`,
                    opacity: isSelected ? 1 : 0.55,
                  }}
                >
                  {brand.logo && (
                    <img
                      src={brand.logo}
                      alt=""
                      className="rounded-lg object-cover"
                      style={{ width: "clamp(57px, 4.5vw, 75px)", height: "clamp(57px, 4.5vw, 75px)" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  {brand.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {Array.from(selectedBrandIds).map((brandId) => {
        const brand = brands.find((b) => b.id === brandId);
        if (!brand) return null;
        return (
          <div key={brand.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: labelMb,
              }}
            >
              <label className="block text-foreground/60" style={{ fontSize: labelFs }}>
                DÒNG MÀU
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(4px, 0.32vw, 6px)" }}>
              {brand.subcollections.map((sub) => {
                const checked = selectedSubIds.has(sub.id);
                return (
                  <button
                    key={sub.id}
                    onClick={() => toggleSubCollection(sub.id)}
                    className="rounded-lg transition-all duration-200 flex items-center gap-0.5"
                    style={{
                      padding: "clamp(3px, 0.22vw, 5px) clamp(8px, 0.55vw, 10px)",
                      fontSize: "clamp(11px, 0.57vw, 12px)",
                      background: checked ? "rgba(255,0,82,0.15)" : "var(--ingredient-card)",
                      color: checked ? "#ff0052" : undefined,
                      border: `1px solid ${checked ? "rgba(255,0,82,0.25)" : "transparent"}`,
                      opacity: checked ? 1 : 0.5,
                    }}
                  >
                    {sub.product_img && (
                      <img
                        src={sub.product_img}
                        alt=""
                        className="rounded-lg object-cover"
                        style={{ width: "clamp(57px, 4.5vw, 75px)", height: "clamp(57px, 4.5vw, 75px)" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    {sub.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── Mobile brand section ───
  const renderMobileBrandSection = () => (
    <div className="space-y-3">
      <div>
        <label className="block text-foreground/60 text-xs font-bold tracking-wider mb-1">HÃNG</label>
        {brandsLoading ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-full animate-pulse bg-foreground/10 h-8 w-18" />
            ))}
          </div>
        ) : (
          <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar gap-2 py-1 px-4 -mx-4 select-none whitespace-nowrap">
            {brands.map((brand) => {
              const isSelected = selectedBrandIds.has(brand.id);
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  className="rounded-lg transition-all duration-200 shrink-0 px-4 py-2 text-sm font-medium flex items-center gap-2"
                  style={{
                    background: isSelected ? "#ff0052" : "var(--ingredient-card)",
                    color: isSelected ? "#fff" : "var(--color-foreground)",
                    opacity: isSelected ? 1 : 0.65,
                  }}
                >
                  {brand.logo && (
                    <img
                      src={brand.logo}
                      alt=""
                      className="rounded-lg object-cover"
                      style={{ width: "57px", height: "57px" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  {brand.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {Array.from(selectedBrandIds).map((brandId) => {
        const brand = brands.find((b) => b.id === brandId);
        if (!brand) return null;
        return (
          <div key={brand.id} className="space-y-1">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-foreground/60 text-xs font-bold tracking-wider uppercase">
                Dòng màu
              </label>
            </div>
            <div className="flex flex-row flex-nowrap overflow-x-auto no-scrollbar gap-2 py-1 px-4 -mx-4 select-none whitespace-nowrap">
              {brand.subcollections.map((sub) => {
                const checked = selectedSubIds.has(sub.id);
                return (
                  <button
                    key={sub.id}
                    onClick={() => toggleSubCollection(sub.id)}
                    className="rounded-lg transition-all duration-200 shrink-0 px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
                    style={{
                      background: checked ? "rgba(255,0,82,0.15)" : "var(--ingredient-card)",
                      color: checked ? "#ff0052" : undefined,
                      border: `1px solid ${checked ? "rgba(255,0,82,0.25)" : "transparent"}`,
                      opacity: checked ? 1 : 0.6,
                    }}
                  >
                    {sub.product_img && (
                      <img
                        src={sub.product_img}
                        alt=""
                        className="rounded-lg object-cover"
                        style={{ width: "57px", height: "57px" }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    {checked ? "✓ " : ""}
                    {sub.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─── Mobile portrait layout ───
  if (isMobile) {
    return (
      <>
        <div className="landscape-lock-warning font-sans">
          <p className="font-semibold text-sm tracking-wide">Hãy xoay dọc màn hình.</p>
        </div>

        <div
          className="app-container h-[100dvh] w-screen flex flex-col overflow-hidden bg-background text-foreground"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          <div
            ref={containerRef}
            className="h-[45vh] w-full relative overflow-hidden bg-muted flex items-center justify-center shrink-0 border-b border-border select-none"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
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
                  onClick={() => {
                    setImage(null);
                    setSelectedColor(null);
                    setSelectedPixel(null);
                  }}
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
                        e.touches[0].clientY - e.touches[1].clientY,
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
                        e.touches[0].clientY - e.touches[1].clientY,
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div className="h-[55vh] w-full flex flex-col bg-background border-t border-border rounded-t-2xl shadow-xl overflow-hidden relative">
            <div className="flex justify-center py-3 shrink-0 select-none">
              <div className="w-12 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
              <div className="relative shrink-0 w-full" style={{ height: previewH, marginBottom: previewMb }}>
                <div
                  className="absolute right-0 rounded-2xl border border-foreground/[0.09] overflow-hidden transition-colors duration-400"
                  style={{ background: mixResultHex ?? "var(--popover)", top: "0%", bottom: "-10%", left: "28%" }}
                >
                  {hasColor && (
                    <div
                      className="flex items-center justify-end"
                      style={{ gap: mixGap, padding: `${mixPt} ${mixPt} 0 ${mixPt}` }}
                    >
                      <span className="font-medium" style={{ color: mixTextColor, opacity: 0.65, fontSize: mixFs }}>
                        {recipeLoading ? "Đang tìm..." : "Mix Result"}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className="absolute left-0 rounded-2xl border border-foreground/[0.14] overflow-hidden z-10 transition-colors duration-300"
                  style={{ background: selectedColor?.hex ?? "var(--card)", top: "10%", bottom: 0, width: "56%" }}
                >
                  {selectedColor && (
                    <button
                      onClick={() => {
                        setSelectedColor(null);
                        setSelectedPixel(null);
                      }}
                      className="absolute top-2 right-2 z-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md"
                      style={{
                        width: "clamp(20px, 1.56vw, 28px)",
                        height: "clamp(20px, 1.56vw, 28px)",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        opacity: 0.7,
                      }}
                    >
                      <X style={{ color: "#fff", width: "clamp(10px, 0.68vw, 14px)", height: "clamp(10px, 0.68vw, 14px)" }} />
                    </button>
                  )}
                  <div className="flex items-start" style={{ padding: `${targetPt} ${mixPt} 0 ${mixPt}` }} />
                </div>
              </div>

              {renderMobileBrandSection()}

              <div className="flex rounded-lg overflow-hidden border border-foreground/[0.08]">
                {(["suggested", "formula"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex-1 text-center py-2 transition-all duration-200 font-semibold"
                    style={{
                      fontSize: "13px",
                      fontFamily: "'JetBrains Mono', monospace",
                      background: activeTab === tab ? "#ff0052" : "transparent",
                      color: activeTab === tab ? "#fff" : "var(--color-foreground)",
                      opacity: activeTab === tab ? 1 : 0.45,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {tab === "suggested" ? "Đề xuất" : "Công thức"}
                  </button>
                ))}
              </div>

              {activeTab === "suggested" ? (
                <div className="flex items-center justify-center py-8">
                  {recipeLoading ? (
                    <span className="text-foreground/40 text-sm">Đang tải...</span>
                  ) : recipeResult ? (
                    <pre className="text-foreground/70 text-sm whitespace-pre-wrap">
                      {JSON.stringify(recipeResult, null, 2)}
                    </pre>
                  ) : (
                    <div />
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {recipeLoading ? (
                    <div className="text-foreground/40 text-sm text-center py-4">Đang tính công thức...</div>
                  ) : recipeResult ? (
                    <pre className="text-foreground/70 text-sm whitespace-pre-wrap">
                      {JSON.stringify(recipeResult, null, 2)}
                    </pre>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="rounded-xl border-2 border-dashed border-foreground/[0.09] flex items-center justify-center w-full h-12">
                          <span className="text-foreground/35 text-xs font-bold uppercase tracking-wider">
                            Thành phần
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border shrink-0 flex items-center justify-center px-4 py-2.5 bg-background/50 relative">
              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="relative rounded-full transition-colors duration-300"
                style={{
                  width: 44,
                  height: 24,
                  background: isDarkMode ? "#3a3a42" : "#ff0052",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    width: 18,
                    height: 18,
                    left: isDarkMode ? 3 : "calc(100% - 21px)",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                >
                  {isDarkMode ? (
                    <Moon style={{ width: 10, height: 10, color: "#5a5a66" }} />
                  ) : (
                    <Sun style={{ width: 10, height: 10, color: "#ff0052" }} />
                  )}
                </div>
              </button>
              <span className="absolute right-4 text-foreground/40 text-xs font-medium select-none">thaidd@gmail.com</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── Desktop layout ───
  return (
    <>
      <div className="landscape-lock-warning font-sans">
        <p className="font-semibold text-sm tracking-wide">Hãy xoay dọc màn hình.</p>
      </div>

      <div
        className="app-container h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="flex flex-1 min-h-0">
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
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
                  <div
                    className="rounded-xl bg-foreground/[0.05] flex items-center justify-center"
                    style={{ width: uploadIcCtSz, height: uploadIcCtSz }}
                  >
                    <Upload className="text-foreground/50" style={{ width: uploadIconSz, height: uploadIconSz }} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground/75" style={{ fontSize: uploadTitleFs }}>
                      Kéo thả hoặc click để upload ảnh
                    </p>
                    <p className="text-foreground/45" style={{ fontSize: uploadSubFs }}>
                      Hỗ trợ JPG, JPEG, PNG, WEBP
                    </p>
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
                  <X
                    style={{
                      width: "clamp(10px, 0.68vw, 13px)",
                      height: "clamp(10px, 0.68vw, 13px)",
                      opacity: 0.75,
                    }}
                  />
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
                    <div
                      className="rounded"
                      style={{
                        width: hoverSwSz,
                        height: hoverSwSz,
                        background: hoverColor,
                        border: `${hoverSwBw} solid rgba(255,255,255,0.2)`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <aside className="flex flex-col border-l border-border shrink-0 overflow-hidden" style={{ width: sideW }}>
            <div
              className="border-b border-border shrink-0 overflow-y-auto"
              style={{ padding: panelPx, maxHeight: "40%" }}
            >
              {renderBrandSection()}
            </div>
            <div className="border-b border-border shrink-0" style={{ padding: panelPx }}>
              <div className="relative" style={{ height: previewH, marginBottom: previewMb }}>
                <div
                  className="absolute right-0 rounded-2xl border border-foreground/[0.09] overflow-hidden transition-colors duration-400"
                  style={{ background: mixResultHex ?? "var(--popover)", top: "0%", bottom: "-10%", left: "28%" }}
                >
                  {hasColor && (
                    <div
                      className="flex items-center justify-end"
                      style={{ gap: mixGap, padding: `${mixPt} ${mixPt} 0 ${mixPt}` }}
                    >
                      <span className="font-medium" style={{ color: mixTextColor, opacity: 0.65, fontSize: mixFs }}>
                        {recipeLoading ? "Đang tìm..." : "Mix Result"}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className="absolute left-0 rounded-2xl border border-foreground/[0.14] overflow-hidden z-10 transition-colors duration-300"
                  style={{ background: selectedColor?.hex ?? "var(--card)", top: "10%", bottom: 0, width: "56%" }}
                >
                  {selectedColor && (
                    <button
                      onClick={() => {
                        setSelectedColor(null);
                        setSelectedPixel(null);
                      }}
                      className="absolute top-2 right-2 z-20 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:opacity-100 shadow-md"
                      style={{
                        width: "clamp(20px, 1.56vw, 28px)",
                        height: "clamp(20px, 1.56vw, 28px)",
                        background: "rgba(0,0,0,0.35)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        opacity: 0.7,
                      }}
                    >
                      <X style={{ color: "#fff", width: "clamp(10px, 0.68vw, 14px)", height: "clamp(10px, 0.68vw, 14px)" }} />
                    </button>
                  )}
                  <div className="flex items-start" style={{ padding: `${targetPt} ${mixPt} 0 ${mixPt}` }} />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col" style={{ padding: panelPx }}>
              <div
                className="flex shrink-0 rounded-lg overflow-hidden border border-foreground/[0.08] mb-4"
                style={{ marginBottom: ingMb }}
              >
                {(["suggested", "formula"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="flex-1 text-center py-2 transition-all duration-200"
                    style={{
                      fontSize: "clamp(12px, 0.7vw, 14px)",
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

              {activeTab === "suggested" ? (
                <div className="flex-1 flex items-center justify-center">
                  {recipeLoading ? (
                    <span className="text-foreground/40 text-sm">Đang tải...</span>
                  ) : recipeResult ? (
                    <pre className="text-foreground/70 text-sm whitespace-pre-wrap overflow-auto max-h-full">
                      {JSON.stringify(recipeResult, null, 2)}
                    </pre>
                  ) : (
                    <div />
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: ingGap, overflowY: "auto", flex: 1 }}>
                  {recipeLoading ? (
                    <div className="text-foreground/40 text-sm text-center py-4">Đang tính công thức...</div>
                  ) : recipeResult ? (
                    <pre className="text-foreground/70 text-sm whitespace-pre-wrap overflow-auto flex-1">
                      {JSON.stringify(recipeResult, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: ingGap }}>
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="rounded-xl border-2 border-dashed border-foreground/[0.09] flex items-center justify-center shrink-0"
                          style={{ height: emptyH }}
                        >
                          <span className="text-foreground/35" style={{ fontSize: "clamp(13px, 0.78vw, 16px)" }}>
                            THÀNH PHẦN
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div
              className="border-t border-border shrink-0 flex items-center justify-center relative"
              style={{ padding: "clamp(6px, 0.52vw, 10px) clamp(10px, 0.83vw, 16px)" }}
            >
              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="relative rounded-full transition-colors duration-300"
                style={{
                  width: "clamp(40px, 3.12vw, 56px)",
                  height: "clamp(22px, 1.72vw, 30px)",
                  background: isDarkMode ? "#3a3a42" : "#ff0052",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    width: "clamp(17px, 1.3vw, 24px)",
                    height: "clamp(17px, 1.3vw, 24px)",
                    left: isDarkMode ? "clamp(3px, 0.23vw, 4px)" : "calc(100% - clamp(20px, 1.56vw, 28px))",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                >
                  {isDarkMode ? (
                    <Moon style={{ width: "clamp(9px, 0.68vw, 13px)", height: "clamp(9px, 0.68vw, 13px)", color: "#5a5a66" }} />
                  ) : (
                    <Sun style={{ width: "clamp(9px, 0.68vw, 13px)", height: "clamp(9px, 0.68vw, 13px)", color: "#ff0052" }} />
                  )}
                </div>
              </button>
              <span
                className="absolute right-4 text-foreground/40 select-none"
                style={{ fontSize: "clamp(11px, 0.68vw, 14px)" }}
              >
                thaidd@gmail.com
              </span>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}