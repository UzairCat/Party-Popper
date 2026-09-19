export type PropertyGroup = 'brown' | 'sky' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'navy'
export type TileType = 'START' | 'PROPERTY' | 'TRANSPORT' | 'UTILITY' | 'CARD' | 'TAX' | 'JAIL' | 'FREE' | 'GO_TO_JAIL'
export type DeckName = 'event' | 'community'

export interface BoardTile {
  index: number
  type: TileType
  name: string
  group?: PropertyGroup
  price?: number
  rents?: readonly number[]
  buildCost?: number
  mortgage?: number
  amount?: number
  deck?: DeckName
}

const property = (index: number, name: string, group: PropertyGroup, price: number, rents: readonly number[], buildCost: number): BoardTile => ({
  index, type: 'PROPERTY', name, group, price, rents, buildCost, mortgage: price / 2,
})
const transport = (index: number, name: string): BoardTile => ({ index, type: 'TRANSPORT', name, price: 200, rents: [25, 50, 100, 200], mortgage: 100 })
const utility = (index: number, name: string): BoardTile => ({ index, type: 'UTILITY', name, price: 150, rents: [4, 10], mortgage: 75 })
const cardTile = (index: number, name: string, deck: DeckName): BoardTile => ({ index, type: 'CARD', name, deck })

export const BOARD: readonly BoardTile[] = [
  { index: 0, type: 'START', name: 'Start' },
  property(1, 'Moss Lane', 'brown', 60, [2, 10, 30, 90, 160, 250], 50),
  cardTile(2, 'Neighbourhood News', 'community'),
  property(3, 'Acorn Alley', 'brown', 60, [4, 20, 60, 180, 320, 450], 50),
  { index: 4, type: 'TAX', name: 'City Tax', amount: 200 },
  transport(5, 'North Station'),
  property(6, 'Cloud Court', 'sky', 100, [6, 30, 90, 270, 400, 550], 50),
  cardTile(7, 'Lucky Break', 'event'),
  property(8, 'Breeze Boulevard', 'sky', 100, [6, 30, 90, 270, 400, 550], 50),
  property(9, 'Bluebird Street', 'sky', 120, [8, 40, 100, 300, 450, 600], 50),
  { index: 10, type: 'JAIL', name: 'Jail / Visiting' },
  property(11, 'Rose Row', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  utility(12, 'Bright Grid'),
  property(13, 'Petal Place', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  property(14, 'Carnival Crescent', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
  transport(15, 'East Station'),
  property(16, 'Copper Corner', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  cardTile(17, 'Neighbourhood News', 'community'),
  property(18, 'Sunset Avenue', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  property(19, 'Market Mile', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
  { index: 20, type: 'FREE', name: 'Free Parking' },
  property(21, 'Ember Road', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  cardTile(22, 'Lucky Break', 'event'),
  property(23, 'Ruby Rise', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  property(24, 'Grand Parade', 'red', 240, [20, 100, 300, 750, 925, 1100], 150),
  transport(25, 'South Station'),
  property(26, 'Golden Grove', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  property(27, 'Honey Hill', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  utility(28, 'Flow Works'),
  property(29, 'Sunbeam Square', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { index: 30, type: 'GO_TO_JAIL', name: 'Go to Jail' },
  property(31, 'Fern Fields', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  property(32, 'Willow Way', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  cardTile(33, 'Neighbourhood News', 'community'),
  property(34, 'Evergreen Estate', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  transport(35, 'West Station'),
  cardTile(36, 'Lucky Break', 'event'),
  property(37, 'Midnight Manor', 'navy', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { index: 38, type: 'TAX', name: 'Luxury Tax', amount: 100 },
  property(39, 'Crown Heights', 'navy', 400, [50, 200, 600, 1400, 1700, 2000], 200),
]

export const OWNABLE_TILES = BOARD.filter((tile) => tile.price !== undefined)
export const GROUPS: readonly PropertyGroup[] = ['brown', 'sky', 'pink', 'orange', 'red', 'yellow', 'green', 'navy']

export type EndCondition = 'last' | 'rounds' | 'time'
export type RulePreset = 'classic' | 'quick' | 'casual' | 'custom'
export interface PropertySettings {
  preset: RulePreset
  startingCash: number
  passStartReward: number
  exactStartBonus: boolean
  auctions: boolean
  auctionTimer: number
  auctionIncrement: number
  freeParkingBonus: boolean
  freeParkingStartingPot: number
  trading: boolean
  tradeDevelopedGroups: boolean
  buildingRule: 'even' | 'free'
  buildingTiming: 'own_turn' | 'end_turn' | 'any_time'
  limitedBuildings: boolean
  houseSupply: number
  hotelSupply: number
  buildingSellPercent: number
  mortgageInterest: number
  maxJailTurns: number
  jailFine: number
  collectRentInJail: boolean
  allowDoublesEscape: boolean
  doublesExtraTurn: boolean
  threeDoublesJail: boolean
  turnTimer: number
  autoEndTurn: boolean
  endCondition: EndCondition
  maxRounds: number
  timeLimitMinutes: number
  incomeTax: number
  luxuryTax: number
}

export const CLASSIC_SETTINGS: PropertySettings = {
  preset: 'classic', startingCash: 1500, passStartReward: 200, exactStartBonus: false,
  auctions: true, auctionTimer: 10, auctionIncrement: 10, freeParkingBonus: false,
  freeParkingStartingPot: 0, trading: true, tradeDevelopedGroups: false,
  buildingRule: 'even', buildingTiming: 'own_turn', limitedBuildings: true,
  houseSupply: 32, hotelSupply: 12, buildingSellPercent: 50, mortgageInterest: 10,
  maxJailTurns: 3, jailFine: 50, collectRentInJail: true, allowDoublesEscape: true,
  doublesExtraTurn: true, threeDoublesJail: true, turnTimer: 0, autoEndTurn: false,
  endCondition: 'last', maxRounds: 30, timeLimitMinutes: 60, incomeTax: 200, luxuryTax: 100,
}
export const PRESETS: Record<Exclude<RulePreset, 'custom'>, PropertySettings> = {
  classic: CLASSIC_SETTINGS,
  quick: { ...CLASSIC_SETTINGS, preset: 'quick', startingCash: 1200, turnTimer: 45, limitedBuildings: false, endCondition: 'time', timeLimitMinutes: 60 },
  casual: { ...CLASSIC_SETTINGS, preset: 'casual', startingCash: 2000, passStartReward: 300, freeParkingBonus: true, limitedBuildings: false },
}

export type CardEffect =
  | { type: 'GAIN_MONEY' | 'LOSE_MONEY'; amount: number }
  | { type: 'MOVE_TO'; target: number; collectStart?: boolean }
  | { type: 'MOVE_BY'; amount: number }
  | { type: 'GO_TO_JAIL' | 'GET_OUT_OF_JAIL' }
  | { type: 'COLLECT_EACH' | 'PAY_EACH'; amount: number }
  | { type: 'REPAIRS'; house: number; hotel: number }
  | { type: 'NEAREST'; tileType: 'TRANSPORT' | 'UTILITY' }
export interface GameCard { id: string; deck: DeckName; text: string; effect: CardEffect }
export const CARDS: readonly GameCard[] = [
  { id: 'e1', deck: 'event', text: 'A lucky contract pays out. Collect $50.', effect: { type: 'GAIN_MONEY', amount: 50 } },
  { id: 'e2', deck: 'event', text: 'Head to Start. Collect your Start reward.', effect: { type: 'MOVE_TO', target: 0, collectStart: true } },
  { id: 'e3', deck: 'event', text: 'Move to Grand Parade. Collect Start if you pass it.', effect: { type: 'MOVE_TO', target: 24, collectStart: true } },
  { id: 'e4', deck: 'event', text: 'Go to Jail. Do not collect Start.', effect: { type: 'GO_TO_JAIL' } },
  { id: 'e5', deck: 'event', text: 'A fine for overdue permits. Pay $15.', effect: { type: 'LOSE_MONEY', amount: 15 } },
  { id: 'e6', deck: 'event', text: 'Ride to the nearest station.', effect: { type: 'NEAREST', tileType: 'TRANSPORT' } },
  { id: 'e7', deck: 'event', text: 'Visit the nearest utility.', effect: { type: 'NEAREST', tileType: 'UTILITY' } },
  { id: 'e8', deck: 'event', text: 'Take a few steps back. Move back three spaces.', effect: { type: 'MOVE_BY', amount: -3 } },
  { id: 'e9', deck: 'event', text: 'Property repairs: $25 per house, $100 per hotel.', effect: { type: 'REPAIRS', house: 25, hotel: 100 } },
  { id: 'e10', deck: 'event', text: 'A surprise payout from every player. Collect $50 each.', effect: { type: 'COLLECT_EACH', amount: 50 } },
  { id: 'e11', deck: 'event', text: 'Keep this card: Get Out of Jail Free.', effect: { type: 'GET_OUT_OF_JAIL' } },
  { id: 'c1', deck: 'community', text: 'The neighbourhood thanks you. Collect $100.', effect: { type: 'GAIN_MONEY', amount: 100 } },
  { id: 'c2', deck: 'community', text: 'Medical bills arrive. Pay $50.', effect: { type: 'LOSE_MONEY', amount: 50 } },
  { id: 'c3', deck: 'community', text: 'A birthday gift from every player! Collect $10 each.', effect: { type: 'COLLECT_EACH', amount: 10 } },
  { id: 'c4', deck: 'community', text: 'Community repairs: $40 per house, $115 per hotel.', effect: { type: 'REPAIRS', house: 40, hotel: 115 } },
  { id: 'c5', deck: 'community', text: 'Go directly to Jail.', effect: { type: 'GO_TO_JAIL' } },
  { id: 'c6', deck: 'community', text: 'A shared expense: pay every player $20.', effect: { type: 'PAY_EACH', amount: 20 } },
  { id: 'c7', deck: 'community', text: 'An old friend repays you $20.', effect: { type: 'GAIN_MONEY', amount: 20 } },
  { id: 'c8', deck: 'community', text: 'Advance to Start and collect your reward.', effect: { type: 'MOVE_TO', target: 0, collectStart: true } },
  { id: 'c9', deck: 'community', text: 'A local award brings $200.', effect: { type: 'GAIN_MONEY', amount: 200 } },
  { id: 'c10', deck: 'community', text: 'Keep this card: Get Out of Jail Free.', effect: { type: 'GET_OUT_OF_JAIL' } },
]

export interface PropertyHolding { ownerId: string | null; buildings: number; mortgaged: boolean }
export interface MatchPlayer {
  id: string; name: string; cash: number; position: number; inJail: boolean; jailTurns: number;
  jailCards: string[]; bankrupt: boolean; afkTurns: number; lastRoll?: [number, number];
  stats: { purchased: number; rentPaid: number; rentCollected: number; housesBuilt: number; hotelsBuilt: number; trades: number; jailed: number; distance: number }
}
export type MatchPhase = 'INTRO' | 'PRE_ROLL' | 'PROPERTY_DECISION' | 'AUCTION' | 'TRADE_PENDING' | 'DEBT' | 'MANAGEMENT' | 'FINISHED'
export interface TradeAssets { cash: number; properties: number[]; jailCards: string[] }
export interface TradeOffer { id: string; fromId: string; toId: string; give: TradeAssets; receive: TradeAssets; previousPhase: MatchPhase }
export interface AuctionState { tile: number; highestBid: number; highestBidderId: string | null; passed: string[]; endsAt: number; bankQueue: number[] }
export interface DebtState { playerId: string; creditorId: string | null; amount: number; reason: string; resumePhase: MatchPhase }
export interface MatchSnapshot {
  status: 'ACTIVE' | 'FINISHED'; phase: MatchPhase; paused: boolean; settings: PropertySettings;
  players: Record<string, MatchPlayer>; properties: Record<number, PropertyHolding>;
  order: string[]; currentPlayerId: string; round: number; turnNumber: number;
  turnOrderRolls: Record<string, number>; startedAt: number; endsAt: number | null;
  deadline: number | null; pot: number; dice: [number, number] | null; doublesCount: number;
  pendingTile: number | null; auction: AuctionState | null; trade: TradeOffer | null;
  debt: DebtState | null; lastCard: GameCard | null; lastMove: { playerId: string; from: number; steps: number; to: number; at: number } | null;
  log: { id: number; at: number; text: string }[]; winnerId: string | null; winnerReason: string | null;
}

export type PropertyAction =
  | { type: 'roll' | 'end_turn' | 'buy' | 'decline' | 'bankrupt' | 'pay_debt' | 'pause' | 'resume' | 'end_game' | 'play_again' | 'to_settings' | 'change_game' }
  | { type: 'jail'; choice: 'pay' | 'roll' | 'card' }
  | { type: 'auction_bid'; amount: number }
  | { type: 'auction_pass' }
  | { type: 'build' | 'sell_building' | 'mortgage' | 'unmortgage'; tile: number }
  | { type: 'trade_offer'; toId: string; give: TradeAssets; receive: TradeAssets }
  | { type: 'trade_accept' | 'trade_decline' | 'trade_cancel'; offerId: string }
  | { type: 'trade_counter'; offerId: string; give: TradeAssets; receive: TradeAssets }
