/**
 * One-off: apply supply-chain tags to CustomWatchlist.stockTags by ticker.
 * Usage: node scripts/applySupplyChainTags.mjs
 */
import mongoose from "mongoose";

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://whalesftw123_db_user:49w8s3b7@nodal.s6ldfqo.mongodb.net/?appName=Nodal";

/** @type {Record<string, string[]>} */
const TAGS_BY_TICKER = {
  // 1. Compute / chip design
  NVDA: ["GPU", "AI Accelerator", "Networking", "AI Systems"],
  AMD: ["GPU", "AI Accelerator", "CPU"],
  AVGO: ["ASIC", "Custom Silicon", "Networking", "SerDes"],
  MRVL: ["ASIC", "Custom Silicon", "Networking", "Optical Connectivity"],
  CBRS: ["AI Accelerator", "Wafer Scale", "Inference"],
  INTC: ["CPU", "Foundry", "AI Accelerator"],
  ARM: ["CPU IP", "Semiconductor IP", "Edge AI"],
  QCOM: ["Edge AI", "SoC", "Connectivity"],
  LSCC: ["FPGA", "Edge AI"],
  AMBA: ["Edge AI", "SoC", "Computer Vision"],
  MCHP: ["MCU", "Analog", "Embedded"],
  NXPI: ["MCU", "Edge AI", "Analog", "Connectivity"],
  SWKS: ["RF", "Analog", "Connectivity"],
  MXL: ["Analog", "Connectivity", "Networking"],
  SMTC: ["Analog", "Signal Integrity", "Connectivity"],

  // 2. Power semiconductors / analog
  AOSL: ["Power Semi", "Analog"],
  TXN: ["Analog", "Power Management", "Embedded"],
  STM: ["MCU", "Analog", "Power Semi", "SiC"],
  WOLF: ["SiC", "Power Semi"],
  ON: ["Power Semi", "Analog", "Sensors"],
  VICR: ["Power Semi", "Power Modules", "AI Server Power"],
  NVTS: ["GaN", "SiC", "Power Semi"],
  DIOD: ["Analog", "Power Semi"],

  // 3. Memory / storage
  MU: ["HBM", "DRAM", "NAND", "SSD"],
  SNDK: ["NAND", "Flash", "SSD"],
  STX: ["HDD", "Storage"],
  WDC: ["HDD", "Storage"],
  NTAP: ["Enterprise Storage", "Data Infrastructure"],
  PSTG: ["Flash Storage", "Enterprise Storage", "Data Infrastructure"],
  // App still stores Pure Storage as P (Everpure rebrand; official ticker PSTG)
  P: ["Flash Storage", "Enterprise Storage", "Data Infrastructure"],
  SIMO: ["NAND Controller", "SSD Controller", "Storage"],
  RMBS: ["Memory Interface IP", "CXL", "SerDes"],
  PENG: ["Memory", "CXL", "AI Factory Systems", "GPU Infrastructure"],

  // 4. EDA / semiconductor IP (ARM, RMBS already covered)
  SNPS: ["EDA", "Semiconductor IP"],
  CDNS: ["EDA", "Semiconductor IP"],

  // 5. Foundries
  TSM: ["Foundry", "Advanced Packaging"],
  GFS: ["Foundry", "Silicon Photonics"],
  TSEM: ["Foundry", "Analog", "Silicon Photonics"],

  // 6. Semiconductor equipment / materials
  ASML: ["Lithography", "Semi Equipment"],
  AMAT: ["Semi Equipment", "Deposition", "Etch", "Advanced Packaging"],
  LRCX: ["Semi Equipment", "Etch", "Deposition"],
  ACMR: ["Semi Equipment", "Cleaning", "Plating"],
  ACLS: ["Semi Equipment", "Ion Implant"],
  MKSI: ["Semi Equipment", "Photonics", "Lasers"],
  VECO: ["Semi Equipment", "Deposition", "Photonics Equipment"],
  ENTG: ["Semi Materials", "Filtration", "Process Materials"],
  Q: ["Semi Materials", "Photoresist", "CMP", "Advanced Packaging Materials"],
  PLAB: ["Photomasks", "Semi Materials"],
  LIN: ["Semiconductor Gases", "Materials"],
  APD: ["Semiconductor Gases", "Materials"],
  CBT: ["Specialty Chemicals", "Materials"],
  AXTI: ["InP", "Semi Materials", "Photonics"],

  // 7. Packaging / test / inspection
  ASX: ["Advanced Packaging", "OSAT", "Test"],
  AMKR: ["Advanced Packaging", "OSAT", "Test"],
  KLIC: ["Advanced Packaging Equipment", "Assembly Equipment"],
  FORM: ["Test", "Probe Cards"],
  TER: ["Test", "Semi Equipment"],
  COHU: ["Test", "Handlers", "Semi Equipment"],
  AEHR: ["Burn-In", "Test", "SiC", "Photonics Test"],
  KLAC: ["Inspection", "Metrology", "Semi Equipment"],
  ONTO: ["Inspection", "Metrology", "Advanced Packaging"],

  // 8. High-speed connectivity / CXL / interconnect
  ALAB: ["CXL", "PCIe", "SerDes", "Connectivity"],
  CRDO: ["SerDes", "AEC", "Connectivity"],
  APH: ["Interconnect", "Cables", "Connectors", "Data Center Connectivity"],
  TEL: ["Interconnect", "Connectors", "Data Center Connectivity"],
  BDC: ["Cables", "Networking", "Interconnect"],
  TTMI: ["PCB", "Interconnect", "Data Center Hardware"],

  // 9. Photonics / optical
  COHR: ["Photonics", "Lasers", "Optical Components", "Transceivers"],
  LITE: ["Photonics", "Lasers", "Optical Components", "Transceivers"],
  AAOI: ["Photonics", "Optical Transceivers"],
  POET: ["Photonics", "Optical Engines", "Optical Packaging"],
  LWLG: ["Photonics", "Electro-Optic Materials", "Modulators"],
  FN: ["Photonics", "Optical Manufacturing", "EMS/ODM"],
  CIEN: ["Optical Networking", "Networking", "Photonics"],
  VIAV: ["Optical Test", "Network Test", "Photonics"],
  MTSI: ["Photonics Semis", "Analog/RF", "Optical Connectivity"],
  IPGP: ["Lasers", "Industrial Photonics"],
  LASR: ["Lasers", "Industrial Photonics"],

  // 10. Networking
  ANET: ["Networking", "Ethernet", "AI Networking"],
  CSCO: ["Networking", "Ethernet", "Optical Networking"],
  NOK: ["Networking", "Optical Networking"],
  EXTR: ["Networking", "Ethernet", "AI Networking"],

  // 11. Servers / EMS / ODM
  SMCI: ["AI Servers", "Server Systems"],
  DELL: ["AI Servers", "Server Systems"],
  HPE: ["AI Servers", "Server Systems"],
  CLS: ["EMS/ODM", "AI Servers", "Networking Hardware"],
  JBL: ["EMS/ODM", "Data Center Hardware"],
  FLEX: ["EMS/ODM", "Data Center Hardware", "Data Center Power"],
  SANM: ["EMS/ODM", "Networking Hardware"],
  PLXS: ["EMS/ODM", "Electronics Manufacturing"],
  BHE: ["EMS/ODM", "Electronics Manufacturing"],

  // 12. Neocloud / GPU cloud
  CRWV: ["Neocloud", "GPU Cloud", "AI Infrastructure"],
  NBIS: ["Neocloud", "GPU Cloud", "AI Infrastructure"],
  IREN: ["Neocloud", "GPU Cloud", "AI Data Center", "Bitcoin Mining", "Power"],
  WYFI: ["Neocloud", "GPU Cloud", "AI Data Center"],
  SHAZ: ["Neocloud", "GPU Cloud", "AI Infrastructure"],
  HIVE: ["GPU Cloud", "AI Data Center", "Bitcoin Mining"],

  // 13. AI data-center owners/developers
  APLD: ["AI Data Center", "Colocation", "Data Center Developer"],
  HUT: ["AI Data Center", "Power", "Data Center Developer"],
  WULF: ["AI Data Center", "Power", "Colocation"],
  CORZ: ["AI Data Center", "Colocation", "Bitcoin Mining"],
  EQIX: ["Data Center REIT", "Colocation", "Interconnection"],
  IRM: ["Data Center REIT", "Colocation"],

  // 14. Data-center power equipment
  ETN: ["Electrical", "Power Distribution", "UPS", "Grid"],
  NVT: ["Electrical", "Power Distribution", "Liquid Cooling", "Data Center Equipment"],
  POWL: ["Switchgear", "Electrical", "Power Distribution"],
  HUBB: ["Electrical", "Grid", "Power Distribution"],
  VRT: ["Power Distribution", "UPS", "Cooling", "Liquid Cooling", "Data Center Equipment"],

  // 15. Cooling
  MOD: ["Cooling", "Liquid Cooling", "Thermal Management"],
  CARR: ["Cooling", "HVAC", "Data Center Equipment"],
  TT: ["Cooling", "HVAC", "Thermal Management"],
  JCI: ["Cooling", "HVAC", "Building Systems"],
  FIX: ["HVAC", "Data Center Construction", "Mechanical"],

  // 16. Data-center construction / EPC
  PWR: ["Data Center Construction", "Electrical Contractor", "Grid"],
  EME: ["Data Center Construction", "Electrical", "Mechanical"],
  STRL: ["Data Center Construction", "Civil Construction"],
  MYRG: ["Electrical Contractor", "Grid", "Data Center Construction"],
  FLR: ["EPC", "Data Center Construction", "Nuclear"],

  // 17. Power generation / utilities
  CEG: ["Nuclear", "Power Generation", "Data Center Power"],
  VST: ["Power Generation", "Nuclear", "Data Center Power"],
  TLN: ["Power Generation", "Nuclear", "Data Center Power"],
  EXC: ["Utility", "Grid", "Power Distribution"],
  NEE: ["Utility", "Renewables", "Grid"],
  BE: ["Fuel Cell", "Distributed Power", "Data Center Power"],
  FCEL: ["Fuel Cell", "Distributed Power"],
  SMR: ["Nuclear", "SMR", "Power Generation"],
  OKLO: ["Nuclear", "Advanced Reactor", "Data Center Power"],
  CCJ: ["Uranium", "Nuclear Fuel"],
  TE: ["Solar", "Battery Storage", "Power"],
  SEDG: ["Solar", "Power Electronics", "Energy Storage"],
};

function mergeTags(a = [], b = []) {
  const seen = new Map();
  for (const tag of [...a, ...b]) {
    const label = String(tag || "").trim();
    if (!label) continue;
    seen.set(label.toLowerCase(), label);
  }
  return Array.from(seen.values());
}

const schema = new mongoose.Schema(
  {
    name: String,
    resourceTab: String,
    tickers: [String],
    stockTags: mongoose.Schema.Types.Mixed,
    data: [mongoose.Schema.Types.Mixed],
  },
  { collection: "customwatchlists", strict: false },
);

async function main() {
  await mongoose.connect(MONGO_URI);
  const CustomWatchlist = mongoose.model("CustomWatchlistApplyTags", schema);

  const docs = await CustomWatchlist.find({});
  console.log(`Found ${docs.length} watchlist document(s).\n`);

  const updatedTickers = new Set();
  const missingTickers = new Set(Object.keys(TAGS_BY_TICKER));
  const perDoc = [];

  for (const doc of docs) {
    const name = doc.name || "";
    if (String(name).startsWith("__tab_description__")) continue;

    const tickers = Array.isArray(doc.tickers)
      ? doc.tickers.map((t) => String(t || "").trim().toUpperCase()).filter(Boolean)
      : [];
    const dataTickers = Array.isArray(doc.data)
      ? doc.data
          .map((row) => String(row?.Ticker || "").trim().toUpperCase())
          .filter(Boolean)
      : [];
    const allTickers = Array.from(new Set([...tickers, ...dataTickers]));

    const existingTags =
      doc.stockTags && typeof doc.stockTags === "object" ? { ...doc.stockTags } : {};
    const nextTags = { ...existingTags };
    let changed = 0;

    for (const ticker of allTickers) {
      const desired = TAGS_BY_TICKER[ticker];
      if (!desired) continue;
      missingTickers.delete(ticker);
      const prev = Array.isArray(nextTags[ticker]) ? nextTags[ticker] : [];
      const merged = mergeTags([], desired); // replace with canonical set
      const prevKey = prev.map((t) => String(t).toLowerCase()).sort().join("|");
      const nextKey = merged.map((t) => String(t).toLowerCase()).sort().join("|");
      if (prevKey !== nextKey) {
        nextTags[ticker] = merged;
        changed += 1;
      }
      updatedTickers.add(ticker);
    }

    if (changed > 0) {
      doc.stockTags = nextTags;
      doc.markModified("stockTags");
      await doc.save();
      perDoc.push({
        name: doc.name,
        resourceTab: doc.resourceTab,
        changed,
      });
    } else {
      perDoc.push({
        name: doc.name,
        resourceTab: doc.resourceTab,
        changed: 0,
      });
    }
  }

  console.log("Per-watchlist updates:");
  for (const row of perDoc) {
    console.log(
      `  - ${row.name} [${row.resourceTab || "?"}]: ${row.changed} ticker tag set(s) written`,
    );
  }

  console.log(`\nTickers with tags applied (present in DB): ${updatedTickers.size}`);
  console.log(
    `Tickers in taxonomy but not found on any watchlist: ${missingTickers.size}`,
  );
  if (missingTickers.size > 0) {
    console.log(
      [...missingTickers].sort().join(", "),
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
