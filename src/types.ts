export interface CardData {
  title: string; // 2-6 chars
  desc: string; // HTML string with <strong> and <code> allowed
  icon: string; // Material icon name
}

export interface GeneratedContent {
  mainTitle: string;
  cards: CardData[];
}
