export type BingoMode = '90' | '75';

export type ThemeName = 'pastel-orange' | 'pastel-yellow' | 'classic' | 'neon' | 'minimalist' | 'vintage';

export type PlatformColor =
  | 'red'
  | 'blue'
  | 'green'
  | 'purple'
  | 'black'
  | 'gray'
  | 'brown'
  | 'pink'
  | 'yellow'
  | 'orange';

export interface PlatformColorOption {
  id: PlatformColor;
  name: string;
  swatchHex: string;
  badgeHex: string;
  description: string;
}

export type SpeedPreset = 'slow' | 'normal' | 'fast' | 'turbo' | 'medium';

export interface Ball {
  number: number;
  letter?: string; // For Bingo Americano 75 (B, I, N, G, O)
  drawnAt?: Date;
  order?: number; // 1st, 2nd, etc.
}

export interface GameSettings {
  mode: BingoMode;
  customMin?: number;
  customMax?: number;
  theme: ThemeName;
  platformColor?: PlatformColor;
  speed: SpeedPreset;
  speedSeconds: number; // 5, 3, 1.5, 0.8
  voiceEnabled: boolean;
  sfxEnabled: boolean;
  sayNicknames: boolean; // Traditional Spanish bingo nicknames
  voiceVolume: number;
  selectedVoiceName?: string;
  currencySymbol?: string;
  sheetPrice?: number;
  payoutPercentage?: number;
}

export interface GameState {
  totalBalls: number;
  remainingBalls: number[];
  drawnBalls: Ball[];
  currentBall: Ball | null;
  isPlaying: boolean; // Auto-draw active
  isExtracting: boolean; // Currently animating ball extraction
  isFinished: boolean;
}

// Bingo Sheet / Card Builder Types (Planilla de Bingo por Columnas 1..15)
export interface BingoSheetPlayer {
  id: string;
  name: string;
  color: string; // e.g. '#fef08a' (yellow), '#bbf7d0' (green)
  textColor?: string;
  paid?: boolean;
  cumulativeWon?: number;
  cumulativeDebt?: number;
  balance?: number;
}

export interface BingoSheetCell {
  rowNumber: number; // 1 to 15 (or custom max rows)
  playerId?: string;
  playerName?: string;
  color?: string;
  textColor?: string;
  isPaid?: boolean; // Estado de pago individual de esta casilla
}

export interface BingoSheetColumn {
  id: string;
  colNumber: number;
  title: string; // e.g. "X1", "X2", "X3", or "Col 1"
  multiplier: number; // Multiplicador de la columna: 1 (X1), 2 (X2), 3 (X3), etc.
  hasRedDividerRight?: boolean;
  columnPrice?: number; // Valor individual de la casilla (o calculado: multiplier * baseCost)
  columnCost?: number;
  columnPrize?: number; // Premio individual de la casilla (o calculado: multiplier * basePrize)
  columnTernaPrize?: number; // Premio de terna individual (multiplier * baseTernaPrize)
  columnAmboPrize?: number; // Premio de ambo individual (multiplier * baseAmboPrize)
  cells: BingoSheetCell[];
}

export interface BingoSheetBackground {
  enabled: boolean;
  url?: string;
  presetId?: string;
  opacity: number; // e.g. 0.05 to 1.0, recommended 0.15 - 0.25 to avoid high brightness
  brightness?: number; // e.g. 0.5 to 1.2
  fit?: 'cover' | 'contain' | 'tile';
}

export interface GameObjectives {
  bingo: boolean;
  terna: boolean;
  ambo: boolean;
}

export interface PlayerSummarySnapshotItem {
  id: string;
  name: string;
  totalGano: number;
  debe: number;
  total: number;
  color?: string;
  textColor?: string;
  paid?: boolean;
  currentWon?: number;
  isBingoWinner?: boolean;
  isTernaWinner?: boolean;
  isAmboWinner?: boolean;
}

export interface BingoSheetData {
  title: string;
  subtitle: string;
  hostName: string;
  hostPhone: string;
  columnPrice: number; // Precio base general por X1 (ej: 0.10)
  baseCost: number; // Costo por X1 (ej: 0.10)
  basePrize: number; // Premio por X1 (ej: 1.35)
  bingoEnabled?: boolean; // Indica si en esta partida se paga Bingo (B)
  ternaEnabled?: boolean; // Indica si en esta partida se paga Terna (T)
  baseTernaPrize?: number; // Premio terna base por X1 (ej: 0.50)
  amboEnabled?: boolean; // Indica si en esta partida se paga Ambo (A)
  baseAmboPrize?: number; // Premio ambo base por X1 (ej: 0.25)
  rowMultipliers: Record<number, number>; // Fila -> Multiplicador (1 -> 1, 2 -> 1, 3 -> 2, etc.)
  currency: string;
  totalRows: number; // default 15
  columns: BingoSheetColumn[];
  players: BingoSheetPlayer[];
  background?: BingoSheetBackground;
  customSeqEntries?: Record<number, { ambo?: number | string; terna?: number | string; bingo?: number | string }>;
  playerSummaryList?: PlayerSummarySnapshotItem[];
}

// Work Shift / Turno of an operator
export interface OperatorShift {
  id: string; // e.g. "shift_1730000000_operadora"
  operatorUid: string;
  ownerUid?: string; // UID (Firebase) de la operadora dueña del turno
  operatorName: string;
  operatorEmail?: string;
  startDate: string; // e.g. "26/10/2026"
  startTime: string; // e.g. "15:30:10"
  endDate?: string; // e.g. "26/10/2026"
  endTime?: string; // e.g. "18:45:30"
  timestampISO: string;
  closedAtISO?: string;
  totalGames: number;
  totalLines: number;
  totalCollected: number;
  totalPrizes: number;
  netProfit: number;
  status: 'active' | 'completed';
  gameIds: string[];
}

// Admin & User Management Types
export type UserRole = 'admin' | 'operator' | 'moderator' | 'player';
export type UserStatus = 'active' | 'suspended' | 'pending';

export type FirestoreTimestampLike =
  | { toDate?: () => Date; seconds?: number; nanoseconds?: number }
  | string
  | number
  | Date
  | null;

export type CustomSequenceEntry = {
  ambo?: number | string;
  terna?: number | string;
  bingo?: number | string;
};

export type CustomSequenceMap = Record<number, CustomSequenceEntry>;

export interface GameSequenceSnapshot {
  customSeqEntries?: CustomSequenceMap;
  gameSequence?: GameSequenceItem[];
  amboRow?: number;
  ternaRow?: number;
  bingoRow?: number;
  amboBall?: number;
  ternaBall?: number;
  bingoBall?: number;
  [rowNumber: number]: CustomSequenceEntry | undefined;
}

export interface AppUser {
  id: string; // Document ID / Firebase UID
  uid?: string;
  name: string;
  email: string;
  password?: string;
  passwordHash?: string;
  role: 'admin' | 'operator';
  assignedMode?: '75' | '90' | 'all'; // Operadoras: '75' o '90' exclusivo. Administradoras: 'all'
  status: 'active' | 'suspended';
  joinedDate?: string;
  createdAt?: FirestoreTimestampLike;
  lastActive?: string;
  gamesPlayed?: number;
  notes?: string;
  avatarColor?: string;
}

export interface ActivityLogItem {
  id: string;
  operatorUid: string;
  operatorName: string;
  operatorEmail: string;
  action: string;
  actionType: 'login' | 'register' | 'draw_ball' | 'new_game' | 'save_game' | 'sheet_update' | 'reset_game' | 'role_change' | 'status_change';
  details?: string;
  timestamp: string;
  createdAt?: FirestoreTimestampLike;
  mode?: BingoMode;
}

export interface GameSequenceItem {
  id?: string;
  ownerUid?: string; // UID (Firebase) de la operadora dueña de la partida
  round: number;
  ballNumber: number; // Bingo ball (B)
  ternaBall?: number; // Terna ball (T)
  ternaLeader?: number; // Terna row leader (1..15)
  amboBall?: number; // Ambo ball (A)
  amboLeader?: number; // Ambo row leader (1..15)
  letter?: string;
  mode?: BingoMode; // '75' | '90'
  timestamp: string; // e.g. "15:30:12"
  dateFormatted?: string; // e.g. "20/09/2026"
  dailyDate?: string; // e.g. "2026-09-24" for daily grouping
  operatorFolder?: string; // sanitized folder name for operator e.g. "carla_garcia"
  subfolderDay?: string; // subfolder name YYYY-MM-DD e.g. "2026-10-28"
  folderPath?: string; // full path e.g. "carla_garcia/2026-10-28"
  operatorUid?: string;
  operatorName?: string;
  operatorEmail?: string;
  durationSeconds?: number;
  durationFormatted?: string; // e.g. "6m 45s"
  totalCollected?: number; // Cuánto recaudó ($)
  totalPrizesPaid?: number; // Cuánto se dio en premios ($)
  netProfit?: number; // Ganancias netas ($ = recaudado - premios)
  currency?: string;
  drawnBallsPlayed?: number[]; // Lista de todos los números que se jugaron en esa partida
  totalBallsDrawnCount?: number;
  rowLeader?: number; // row leader (1..15 or 1..30)
  winningPlayerName?: string;
  tableNumber?: number; // for 90-ball sheet (Planilla 1, 2, 3...)
  totalLinesPlayed?: number; // Conteo exacto de líneas usadas/jugadas en esta partida
  sheetType?: SheetViewType; // 'multipliers-15' | 'traditional-90'
  sheet75Snapshot?: BingoSheetData;
  sheet90Snapshot?: Traditional90SheetData;
  markedNumbers?: number[];
  cageSnapshotImage?: string; // Captura en imagen del bolillero tal cual quedó al cantar Bingo
  shiftId?: string; // ID del turno al que pertenece
  shiftName?: string; // e.g. "Turno: 26/10/2026 15:30 - 18:45"
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  playerSummarySnapshot?: PlayerSummarySnapshotItem[];
  sequenceSnapshot?: GameSequenceSnapshot;
  savedViaNewGameFlow?: boolean;
  createdAt?: FirestoreTimestampLike;
}

// Traditional 90-Ball Triples Sheet (Tables 1, 2, 3... with 30 rows of triples [r, r+30, r+60])
export interface Traditional90Row {
  rowNumber: number; // 1 to 30
  numbers: [number, number, number]; // e.g. [1, 31, 61], [2, 32, 62]...
  playerId?: string;
  playerName?: string;
  color?: string;
  textColor?: string;
  paid?: boolean;
}

export interface Traditional90Table {
  id?: string;
  tableNumber: number; // 1, 2, 3, 4...
  title: string; // "1", "2", "3" or custom title
  pricePerRow: number;
  prize?: number;
  footerNotes?: string;
  rows: Traditional90Row[];
}

export interface Traditional90SheetData {
  hostName: string;
  hostPhone: string;
  dateStr: string;
  pricePerRow: number;
  tables?: Traditional90Table[]; // Multiple independent planillas
  table1: Traditional90Table;
  table2: Traditional90Table;
  players: BingoSheetPlayer[];
}

export type SheetViewType = 'multipliers-15' | 'traditional-90';


