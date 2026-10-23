export type Language = 'en' | 'de';

export const WORDS: Record<Language, string[]> = {
  en: `apple|bicycle|castle|dragon|elephant|firework|guitar|hamburger|island|jellyfish|kangaroo|lighthouse|mushroom|octopus|pancake|rainbow|spaceship|telescope|umbrella|volcano|waterfall|whale|wizard|zebra|airplane|balloon|camera|dinosaur|envelope|forest|glasses|helicopter|ice cream|keyboard|mountain|newspaper|penguin|robot|snowman|teapot|unicorn|violin|window|yacht|anchor|backpack|beehive|bridge|cactus|candle|carrot|chessboard|clock|cloud|compass|crown|cupcake|drum|fishbowl|flowerpot|fountain|frog|ghost|giraffe|hammer|hot air balloon|ladder|lantern|mailbox|microscope|moon|motorcycle|palm tree|parrot|pirate|pumpkin|rocket|sandcastle|scarecrow|ship|skateboard|sleeping bag|snail|spider|starfish|suitcase|sunflower|swimming pool|train|treasure chest|treehouse|traffic light|turtle|windmill`.split(
    '|',
  ),
  de: `Apfel|Fahrrad|Schloss|Drache|Elefant|Feuerwerk|Gitarre|Hamburger|Insel|Qualle|Känguru|Leuchtturm|Pilz|Krake|Pfannkuchen|Regenbogen|Raumschiff|Teleskop|Regenschirm|Vulkan|Wasserfall|Wal|Zauberer|Zebra|Flugzeug|Luftballon|Kamera|Dinosaurier|Briefumschlag|Wald|Brille|Hubschrauber|Eiscreme|Tastatur|Berg|Zeitung|Pinguin|Roboter|Schneemann|Teekanne|Einhorn|Geige|Fenster|Segelboot|Anker|Rucksack|Bienenstock|Brücke|Kaktus|Kerze|Karotte|Schachbrett|Uhr|Wolke|Kompass|Krone|Trommel|Goldfischglas|Blumentopf|Brunnen|Frosch|Gespenst|Giraffe|Hammer|Heißluftballon|Leiter|Laterne|Briefkasten|Mikroskop|Mond|Motorrad|Palme|Papagei|Pirat|Kürbis|Rakete|Sandburg|Vogelscheuche|Schiff|Skateboard|Schlafsack|Schnecke|Spinne|Seestern|Koffer|Sonnenblume|Schwimmbad|Zug|Schatztruhe|Baumhaus|Ampel|Schildkröte|Windmühle`.split(
    '|',
  ),
};

export function normalizeGuess(word: string, language: Language): string {
  const value = word
    .trim()
    .toLocaleLowerCase(language === 'de' ? 'de-DE' : 'en-US')
    .replace(/\s+/g, ' ');
  return language === 'de'
    ? value.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    : value;
}

export function wordMask(word: string): string {
  return Array.from(word, (char) => (/[\p{L}\p{N}]/u.test(char) ? '_' : char)).join('');
}

export function wordChoices(
  language: Language,
  customWords: string[],
  usedWords: string[],
): string[] {
  const all = [...new Set([...WORDS[language], ...customWords])];
  const available = all.filter((word) => !usedWords.includes(word));
  const pool = available.length >= 3 ? available : all;
  return pool.sort(() => Math.random() - 0.5).slice(0, 3);
}
