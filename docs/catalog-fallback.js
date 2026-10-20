// Автономная копия каталога SAHAR — используется, если API ещё недоступен.
const FALLBACK_CATEGORIES = [
  {
    "id": 1,
    "name_ru": "Шоколад ручной работы",
    "name_uz": "Qo'lda yasalgan shokolad"
  },
  {
    "id": 2,
    "name_ru": "Конфеты",
    "name_uz": "Konfetlar"
  },
  {
    "id": 3,
    "name_ru": "Зефир и маршмеллоу",
    "name_uz": "Zefir va marshmallow"
  },
  {
    "id": 4,
    "name_ru": "Подарочные наборы",
    "name_uz": "Sovg'a to'plamlari"
  }
];
const FALLBACK_PRODUCTS = [
  {
    "id": 1,
    "category_id": 1,
    "name_ru": "Трюфели «Чёрный бархат»",
    "name_uz": "«Qora baxmal» trüfillari",
    "desc_ru": "Бельгийский тёмный шоколад 72% с какао-кремом. 12 шт в бархатной коробке.",
    "desc_uz": "Belgiya qora shokoladi 72%, kakao-krem. 12 dona baxmat qutida.",
    "price": 189000,
    "old_price": 0,
    "stock": 24,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/63/Chocolate_truffle_-_Godiva_01.jpg/960px-Chocolate_truffle_-_Godiva_01.jpg"
  },
  {
    "id": 2,
    "category_id": 1,
    "name_ru": "Клубника в белом шоколаде",
    "name_uz": "Oq shokoladli qulupnay",
    "desc_ru": "Свежая клубника в бельгийском белом шоколаде. 9 шт.",
    "desc_uz": "Yangi qulupnay, belgiya oq shokoladida. 9 dona.",
    "price": 149000,
    "old_price": 179000,
    "stock": 15,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/020260501_Chocolate-covered_strawberries.jpg/960px-020260501_Chocolate-covered_strawberries.jpg"
  },
  {
    "id": 3,
    "category_id": 1,
    "name_ru": "«SAHAR Gold» — премиальная плитка",
    "name_uz": "«SAHAR Gold» — premium plitka",
    "desc_ru": "Гранд-крю какао из Эквадора, 85%. Съедобная золотая пыль.",
    "desc_uz": "Ekvador grand-cru kakao, 85%. Yes ov qiladigan oltin chang.",
    "price": 95000,
    "old_price": 0,
    "stock": 30,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5f/Green_and_Black%27s_dark_chocolate_bar_1.jpg/960px-Green_and_Black%27s_dark_chocolate_bar_1.jpg"
  },
  {
    "id": 4,
    "category_id": 2,
    "name_ru": "Рахат-лукум «Роза Востока»",
    "name_uz": "«Sharq guli» rahat-lukumi",
    "desc_ru": "Классический рахат-лукум с лепестками розы, обсыпка сахарной пудрой.",
    "desc_uz": "Klassik rahat-lukum, atirgul barglari bilan.",
    "price": 69000,
    "old_price": 0,
    "stock": 40,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Lokum_%28Turkish_Delight%29.jpg/960px-Lokum_%28Turkish_Delight%29.jpg"
  },
  {
    "id": 5,
    "category_id": 2,
    "name_ru": "Птичье молоко ассорти",
    "name_uz": "Qush suti assorti",
    "desc_ru": "Суфле-конфеты в белом и тёмном шоколаде, 16 шт.",
    "desc_uz": "Sufle-konfetlar oq va qora shokoladda, 16 dona.",
    "price": 129000,
    "old_price": 159000,
    "stock": 20,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Black_truffle_bonbon_%2815253151973%29.jpg/960px-Black_truffle_bonbon_%2815253151973%29.jpg"
  },
  {
    "id": 6,
    "category_id": 2,
    "name_ru": "Клюква в шоколаде",
    "name_uz": "Shokoladli klyukva",
    "desc_ru": "Сушёная клюква в тёмном шоколаде — терпкая классика.",
    "desc_uz": "Quritilgan klyukva qora shokoladda.",
    "price": 79000,
    "old_price": 0,
    "stock": 35,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Chocolate_truffle_-_Delacre.jpg/960px-Chocolate_truffle_-_Delacre.jpg"
  },
  {
    "id": 7,
    "category_id": 3,
    "name_ru": "Зефир «Ванильное облако»",
    "name_uz": "«Vanil buluti» zefiri",
    "desc_ru": "Воздушный зефир на натуральном агаре, ваниль Bourbon.",
    "desc_uz": "Yengil zefir, tabiiy agar, Bourbon vanil.",
    "price": 55000,
    "old_price": 0,
    "stock": 50,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Homemade_white_marshmallows.jpg/960px-Homemade_white_marshmallows.jpg"
  },
  {
    "id": 8,
    "category_id": 3,
    "name_ru": "Маршмеллоу «Карамель»",
    "name_uz": "«Karamel» marshmallow",
    "desc_ru": "Жевательный маршмеллоу со вкусом солёной карамели.",
    "desc_uz": "Tuzli karamel tamli marshmallow.",
    "price": 59000,
    "old_price": 69000,
    "stock": 45,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Assorter_berliner_marshmallows.jpg/960px-Assorter_berliner_marshmallows.jpg"
  },
  {
    "id": 9,
    "category_id": 4,
    "name_ru": "Набор «Праздник» — большая коробка",
    "name_uz": "«Bayram» to'plami — katta quti",
    "desc_ru": "30 конфет: трюфели, суфле, ореховые. Готовая подарочная упаковка с лентой.",
    "desc_uz": "30 dona: trüfel, sufle, yong'oqli. Tayyor sovg'a qadoqda.",
    "price": 349000,
    "old_price": 399000,
    "stock": 10,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Box_of_Valentine_Chocolates.JPG/960px-Box_of_Valentine_Chocolates.JPG"
  },
  {
    "id": 10,
    "category_id": 4,
    "name_ru": "Набор «Дорогому человеку»",
    "name_uz": "«Sevgan insonga» to'plami",
    "desc_ru": "Элитные трюфели + клубника в шоколаде в чёрной коробке SAHAR.",
    "desc_uz": "Elit trüfel + shokoladli qulupnay, SAHAR qora qutisida.",
    "price": 279000,
    "old_price": 0,
    "stock": 12,
    "is_active": true,
    "image_url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Chocolate_Truffles_at_Harrods_in_London_by_Robbie_Conceptuel.png/960px-Chocolate_Truffles_at_Harrods_in_London_by_Robbie_Conceptuel.png"
  }
];
