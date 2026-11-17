// Prince Mohsey, the computer player met at the end of the game. He plays Esm Famil from his own word lists
// (no outside service, nothing to pay for) and talks in character. Countries come from the shared country list.
'use strict';
const G = require('./game.js');

const W = s => s.split(',').map(x => x.trim()).filter(Boolean);
const WORDS = {
  name: W(`Adam, Alice, Amir, Anna, Arash, Ava, Ben, Bella, Babak, Bianca, Carl, Clara, Cyrus, Chloe, Daniel, Dara, Diana, David, Emma, Elias, Eva, Ethan, Farhad, Fatima, Felix, Freya, George, Grace, Giv, Greta, Hana, Hugo, Hamid, Helen, Ian, Iris, Iraj, Isabel, Jack, Jasmine, Jamshid, Julia, Kaveh, Kate, Karl, Kian, Laila, Leo, Lucas, Lily, Mina, Maria, Max, Milad, Nasrin, Noah, Nora, Nima, Omid, Olivia, Oscar, Olga, Parisa, Paul, Peter, Pouya, Rostam, Rosa, Reza, Ruby, Sara, Simon, Sohrab, Sophie, Tara, Thomas, Tina, Teodor, Ursula, Ulrich, Uma, Umar, Victor, Vera, Vida, Viktor, William, Wanda, Walter, Wendy`),
  surname: W(`Anderson, Ahmadi, Abbasi, Bauer, Brown, Bahrami, Carter, Cohen, Costa, Davis, Dashti, Dubois, Edwards, Ebrahimi, Evans, Fischer, Farahani, Ford, Garcia, Gruber, Ghorbani, Hoffmann, Hosseini, Harris, Ibrahim, Irani, Ivanov, Jones, Jafari, Johnson, Keller, Karimi, King, Lang, Lopez, Lewis, Moradi, Martin, Meyer, Nouri, Nelson, Novak, Omidi, Olsen, Owen, Pichler, Parsa, Price, Rahimi, Rossi, Richter, Smith, Schmidt, Sadeghi, Taylor, Tehrani, Turner, Ulrich, Underwood, Unger, Vogel, Vahdati, Vargas, Wagner, Wilson, Weber`),
  city: W(`Amsterdam, Athens, Ahvaz, Berlin, Bangkok, Bam, Cairo, Chicago, Copenhagen, Dublin, Delhi, Dubai, Edinburgh, Esfahan, Essen, Florence, Frankfurt, Graz, Geneva, Gorgan, Hamburg, Hamadan, Helsinki, Istanbul, Innsbruck, Isfahan, Jakarta, Jerusalem, Kerman, Kabul, Kyoto, Lisbon, London, Linz, Madrid, Mashhad, Milan, Munich, Nairobi, Naples, Nice, Oslo, Osaka, Oxford, Paris, Prague, Porto, Rome, Rasht, Riga, Salzburg, Shiraz, Seoul, Sydney, Tehran, Tabriz, Tokyo, Toronto, Utrecht, Ulm, Uppsala, Urmia, Vienna, Venice, Valencia, Vancouver, Warsaw, Washington, Wellington, Yazd`),
  animal: W(`Antelope, Ant, Alligator, Bear, Bee, Buffalo, Camel, Cat, Cheetah, Deer, Dolphin, Donkey, Eagle, Elephant, Eel, Falcon, Fox, Frog, Giraffe, Goat, Gazelle, Horse, Hedgehog, Hawk, Ibex, Iguana, Impala, Jaguar, Jackal, Jellyfish, Kangaroo, Koala, Kingfisher, Lion, Leopard, Lynx, Monkey, Mouse, Mole, Nightingale, Newt, Narwhal, Owl, Otter, Octopus, Panda, Peacock, Parrot, Rabbit, Raven, Rhino, Snake, Sheep, Swan, Tiger, Turtle, Toucan, Urchin, Unicorn fish, Vulture, Viper, Vole, Wolf, Whale, Walrus`),
  food: W(`Apple, Ash reshteh, Avocado, Bread, Baklava, Burger, Cake, Cheese, Couscous, Dates, Dumplings, Dolma, Egg, Eggplant stew, Enchilada, Fesenjan, Falafel, Fries, Ghormeh sabzi, Goulash, Granola, Honey, Hummus, Halva, Ice cream, Irish stew, Idli, Jam, Jelly, Kebab, Kuku, Kaiserschmarrn, Lasagne, Lentil soup, Lemon, Mango, Muffin, Noodles, Nougat, Nan, Omelette, Olives, Orange, Pizza, Pasta, Pancake, Rice, Risotto, Ravioli, Salad, Sachertorte, Soup, Tahdig, Toast, Tomato, Udon, Upside-down cake, Vanilla pudding, Vegetable soup, Waffle, Wiener schnitzel, Walnut`),
  thing: W(`Anchor, Armchair, Arrow, Book, Bottle, Bell, Candle, Clock, Comb, Door, Drum, Desk, Envelope, Eraser, Easel, Fork, Fan, Flag, Glass, Guitar, Glove, Hammer, Hat, Helmet, Ink, Iron, Igloo, Jar, Jacket, Jug, Key, Kettle, Kite, Lamp, Ladder, Lantern, Mirror, Mace, Map, Needle, Notebook, Net, Oar, Oven, Pen, Pillow, Plate, Ring, Rope, Ruler, Spoon, Shield, Sword, Table, Teapot, Telescope, Umbrella, Urn, Vase, Violin, Vest, Wallet, Watch, Window`),
  color: W(`Amber, Aqua, Apricot, Black, Blue, Bronze, Crimson, Cream, Cyan, Denim, Dark green, Emerald, Ebony, Fuchsia, Fern green, Gold, Green, Grey, Hazel, Honey, Indigo, Ivory, Jade, Jet black, Khaki, Lavender, Lemon, Lilac, Magenta, Maroon, Mint, Navy, Nude, Olive, Orange, Pink, Purple, Peach, Red, Rose, Ruby, Saffron, Silver, Scarlet, Teal, Turquoise, Tan, Umber, Ultramarine, Violet, Vermilion, White, Wine red, Wheat`)
};
WORDS.country = require('./countries.js').NAMES.filter(n => /^[A-Za-z][A-Za-z .'-]+$/.test(n) && n.length > 3);

const known = {};
Object.keys(WORDS).forEach(c => { known[c] = new Set(WORDS[c].map(w => G.key(w))); });
const pick = list => list[Math.floor(Math.random() * list.length)];

// His sheet for a round: most boxes filled, a few left empty, as a good but human player would.
function play(letter, cats, skill = 0.85) {
  const a = {};
  cats.forEach(c => { const options = (WORDS[c] || []).filter(w => G.startsWith(w, letter)); a[c] = options.length && Math.random() < skill ? pick(options) : ''; });
  return a;
}
const knows = (cat, text) => !!(known[cat] && known[cat].has(G.key(text)));

const LINES = {
  hello: [
    'Welcome to my table! I have not played since I left Iran. Be gentle with me. Or don’t.',
    'Sophie says I take this game far too seriously. She is right. Shall we begin?',
    'You found me! The least I can do is beat you at Esm Famil.',
    'Sit down, sit down. A coffee? This is Vienna, after all. Now, the letter…'
  ],
  win: [
    'Ha! Rostam would be proud of me. Another round?',
    'The Prince of Iran keeps his crown. For now.',
    'Well played, but the table belongs to me today. Try again!'
  ],
  lose: [
    'You beat me! I will have to tell Sophie, and she will never let me forget it.',
    'Bravo! Even the Simurgh would bow to that.',
    'I surrender my crown, but only until the next round.'
  ],
  draw: [
    'A draw! Like Rostam and Esfandiyar on the first day. Again?',
    'Exactly equal. The old King of Rum would call that diplomacy.'
  ],
  late: ['The clock ran out before your answers reached me. That one is mine!']
};

module.exports = { WORDS, play, knows, LINES, pick };
