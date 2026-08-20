export interface MenuItem {
  meal: string;
  items: string[];
  nonVeg?: string;
  veg?: string;
}

export interface DayMenu {
  [key: string]: MenuItem[];
}

export interface WeekMenu {
  [day: string]: DayMenu;
}

// Common items available all days. Transcribed from the Ideal Catering
// Services menu sheet; the two week cycles print identical common items apart
// from "Steam Rice" (odd) vs "White Rice" (even) at dinner.
export const commonItems = {
  breakfast: "Tea, Coffee, Milk, Bournvita/Cornflakes/Oats, Bread, Butter, Jam, Sprouts, Fruits/Egg",
  lunch: "Salad, Pickle, Papad, Curd, Pulka Roti, Ghee Roti, Steam Rice, Kerala Rice",
  snacks: "Tea, Coffee, Snacks (on payment basis)",
  dinner: "Salad, Pickle, Papad, Pulka Roti, Steam Rice, Kerala Rice"
};

const KEDARAM_SNACKS = [{ meal: "Snacks", items: ["Tea/Coffee", "Snacks (on payment basis)"] }];

// Kedaram Mess Menu — Odd Weeks (1st & 3rd Week)
export const week1and3Menu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Idli", "Wada", "Sambhar", "Chatni", "Boiled Egg/Banana", "Boiled Peanut", "Cornflakes"] }],
    Lunch: [{ meal: "Lunch", items: ["Padwal Chana Dry", "Aloo Tomato Raswala", "Jeera Rice", "Dal Makhani", "Sambhar", "Fresh Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Cabbage Thoran", "Gobi Mutter Masala", "Steam Rice", "Dal Fry", "Rasam", "Seviya Kheer"] }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poori Bhaji/Puttu", "Kadala Curry", "Boiled Egg/Watermelon", "Sprouted Moong", "Bournvita"] }],
    Lunch: [{ meal: "Lunch", items: ["Mix Veg Dry", "Dal Khichdi", "Dahi Kadhi Pakoda", "Sambhar", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Paneer Mutter Masala", "Tomato Rice", "Dal Pancharatna", "Rasam", "Ice Cream"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Podi Dosa", "Chatni", "Sambhar", "Boiled Egg/Banana", "Boiled Chana", "Oats"] }],
    Lunch: [{ meal: "Lunch", items: ["Aloo Bhindi Dry", "Rajma Masala", "Tadka Rice", "Dal Kolhapuri", "Sambhar", "Fresh Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Dudhi Chana Dry", "Steam Rice", "Dal Methi", "Rasam", "Gulab Jamun"], veg: "Paneer Kadai", nonVeg: "Chicken Kadai" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poha & Upma", "Chatni", "Mix Sprouts", "Cornflakes"], veg: "Cut Fruits", nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Aloo Jeera Dry", "Chole Masala", "Poori", "Lemon Rice", "Dal Tadka", "Moru Curry", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Tendli Chana (Kovakka) Dry", "Steam Rice", "Dal Palak", "Rasam", "Pineapple Sheera"], veg: "Corn Capsicum / Mushroom Masala", nonVeg: "Egg Curry" }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Pav Bhaji", "Vellappam with Veg Stew", "Boiled Egg/Banana", "Sprouts", "Bournvita"] }],
    Lunch: [{ meal: "Lunch", items: ["Carrot Aloo Beans Dry", "Sprouted Mix Curry", "Steam Rice", "Dal Fry", "Methi Paratha", "Sambhar", "Fresh Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Cabbage Poriyal", "Ghee Rice", "Mix Dal", "Burfi/Laddu"], veg: "Paneer Kolhapuri", nonVeg: "Chicken Kolhapuri" }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha/Seviya Upma", "Curd/Green Chatni", "Boiled Egg/Banana", "Oats", "Sprouts"] }],
    Lunch: [{ meal: "Lunch", items: ["Chana Masala", "Veg Pulao", "Veg Raita", "Dal Fry", "Buttermilk", "Rasam", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Aloo Capsicum Dry", "Soyabean Mutter Masala", "Tadka Rice", "Yellow Dal Tadka", "Sambhar", "Payasam"] }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Masala Dosa", "Sambhar", "Chatni", "Boiled Egg/Banana", "Cornflakes", "Sprouts"] }],
    Lunch: [{ meal: "Lunch", items: ["Raita", "Beetroot Dry", "Dal Tadka", "Lime Juice"], veg: "Veg with Paneer Biryani", nonVeg: "Chicken Biryani" }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Raw Banana Dry", "Aloo Mutter Gravy", "Steam Rice", "Dal Fry", "Triangle Paratha", "Sambhar", "Fruit Custard"] }]
  }
};

// Kedaram Mess Menu — Even Weeks (2nd & 4th Week)
export const week2and4Menu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Idli", "Wada", "Sambhar", "Chatni", "Boiled Egg/Banana", "Boiled Black Chana", "Cornflakes"] }],
    Lunch: [{ meal: "Lunch", items: ["Whole Pulses Dry", "Dahi Bhindi Masala", "Dal Pappu", "Sambhar", "Fresh Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Cabbage Mutter Dry", "Veg Kofta Curry", "Chana Dal Masala", "Rasam", "Seviya Kheer"] }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poori Bhaji/Nool Puttu", "Kadala Curry", "Boiled Egg/Watermelon", "Sprouted Moong", "Bournvita"] }],
    Lunch: [{ meal: "Lunch", items: ["Veg Kolhapuri", "Tomato Rice", "Raita", "Dal Tadka", "Sambhar", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Aloo Green Chawli Dry", "Mutter Paneer", "Rice", "Dal Fry", "Rasam", "Ice Cream"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Set Dosa", "Red Chatni", "Sambhar", "Boiled Egg/Banana", "Sprouts", "Oats"] }],
    Lunch: [{ meal: "Lunch", items: ["Mix Veg Dry", "Methi Malai Mutter", "Triangle Paratha", "Steam Rice", "Dal", "Sambhar", "Jaljeera"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Beetroot Poriyal", "Green Peas Pulao", "Dal", "Rasam", "Gulab Jamun"], veg: "Paneer Kolhapuri", nonVeg: "Chicken Kolhapuri" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poha & Upma", "Chatni", "Sprouts", "Cornflakes"], veg: "Cut Fruits", nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Aloo Methi/Aloo Jeera", "Chole Masala", "Poori", "Lemon Rice", "Moru Curry", "Dal", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Padwal Chana Dry", "Dal Fry", "Snake Gourd Dry", "Rasam", "Pineapple Sheera"], veg: "Corn Capsicum / Mushroom Masala", nonVeg: "Egg Masala" }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Pav Bhaji", "Vellappam with Veg Stew", "Boiled Egg/Banana", "Boiled Black Chana", "Bournvita"] }],
    Lunch: [{ meal: "Lunch", items: ["Veg Soya Chunk", "Rajma Masala", "Jeera Rice", "Dal Palak", "Sambhar", "Fresh Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Cabbage Poriyal", "Dal Lasooni Tadka", "Burfi/Laddu"], veg: "Paneer Tikka Masala", nonVeg: "Chicken Kebab with Curry" }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha/Green Peas Upma", "Curd/Green Chatni", "Boiled Egg/Banana", "Oats", "Sprouts"] }],
    Lunch: [{ meal: "Lunch", items: ["Mix Veg Semi Dry", "Besan Gatte Masala", "Dal Fry", "Steam Rice", "Rasam", "Flavoured Juice"] }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Veg Fried Rice", "Veg Noodles", "Veg Manchurian Gravy", "Aloo Capsicum", "Dal Adraki", "Rasam", "Payasam"] }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Masala Dosa", "Sambhar", "Chatni", "Boiled Egg/Banana", "Cornflakes", "Boiled Peanut"] }],
    Lunch: [{ meal: "Lunch", items: ["Mandi Rice", "Beetroot Dry", "Dal Tadka", "Lime Juice"], veg: "Paneer Masala", nonVeg: "Chicken Masala" }],
    Snacks: KEDARAM_SNACKS,
    Dinner: [{ meal: "Dinner", items: ["Aloo Mutter Dry", "Brinjal Curry", "Triangle Paratha", "Sambhar", "Fruit Custard"] }]
  }
};

export const kedaramMessMenu: WeekMenu = week1and3Menu;

// Nila Campus Mess - Manu Catering Service
export const nilaCommonItems = {
  breakfast: "Tea, Coffee, Milk, Cornflakes, Fruit or Egg (Single), Jam & Butter, Bread (White & Brown), Sprouts",
  lunch: "White Rice, Boiled Rice, Sambar, Buttermilk, Moru Curry or Rasam, Pickle, Chapathi, Dhal, Pappadam or Fryums",
  snacks: "Watermelon Juice or Lemon Juice",
  dinner: "White Rice, Boiled Rice, Sambar, Dhal, Chapathi, Veg Salad, Lime Juice"
};

export const nilaMessMenu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poori Masala"], veg: "Puttu Kadala" }],
    Lunch: [{ meal: "Lunch", items: ["Mini Meals: Bisibelebadh", "Tomato Rice", "Curd Rice", "Chana Masala", "Thoran", "Sweet"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Ghee Rice", "Fruits"], veg: "Kadai Paneer", nonVeg: "Kadai Chicken" }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha / Mix Veg Paratha", "Curd", "Tomato Sauce"], veg: "Nool Puttu, Cherupayar Curry" }],
    Lunch: [{ meal: "Lunch", items: ["Kovakka Upperi", "Alu Soyabean Dry", "Sweet", "Fish Curry"], nonVeg: "Chicken Dry Fry / Chicken Curry / Omelet" }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Jeera Rice", "Chilli Gobi", "Veg Soup"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Masala Dosa", "Chutney", "Sambar"], veg: "Poha / Vellappam, Kuruma" }],
    Lunch: [{ meal: "Lunch", items: ["Rajma Masala", "Sweet", "Thoran"], nonVeg: "Chicken Dry Fry, Fish Fry, Chicken Curry" }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Sweet"], veg: "Mutter Paneer / Palak Paneer", nonVeg: "Egg Masala" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Poori Masala"], veg: "Vellappam, Veg Stew" }],
    Lunch: [{ meal: "Lunch", items: ["Mini Sadya with Payasam"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Ghee Rice", "Kerala Parotta (Max 3)", "Sliced Fruits"], veg: "Gobi Masala", nonVeg: "Chicken Curry" }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Ghee Roast", "Chutney", "Sambar"], veg: "Puttu Kadala Curry" }],
    Lunch: [{ meal: "Lunch", items: ["Thoran", "Sweet"], nonVeg: "Chicken Dry Fry / Chicken Curry / Omelet / Fish Curry", veg: "Kadai Paneer" }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Raw Rice", "Boiled Rice", "Mixed Veg Sabji"] }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Idli", "Vada", "Chutney", "Sambar"], veg: "Nool Puttu, Green Peas Curry" }],
    Lunch: [{ meal: "Lunch", items: ["Raw Rice", "Boiled Rice", "Upperi", "Potato Brinjal Subji", "Kootucurry", "Ice Cream"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Veg Fried Rice", "Sweet / Sliced Fruit"], veg: "Veg Manchurian / Aloo Mutter Sabji" }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Veg Uppuma", "Chutney"], veg: "Vellappam, Veg Stew" }],
    Lunch: [{ meal: "Lunch", items: ["Gulab Jamun", "Raita", "Mandi (Alternate Sundays)"], veg: "Veg Biryani / Paneer Butter Masala", nonVeg: "Chicken Biryani (100g Chicken)" }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["White Rice", "Boiled Rice", "Soya Fry", "Dal Tadka", "Sweet"] }]
  }
};

// Mess Timings
export interface MessTimings {
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
}

export const weekdayTimings: MessTimings = {
  breakfast: "7:20 AM - 9:30 AM",
  lunch: "12:00 PM - 2:15 PM",
  snacks: "4:30 PM - 6:00 PM",
  dinner: "7:00 PM - 9:00 PM"
};

export const weekendTimings: MessTimings = {
  breakfast: "7:45 AM - 10:00 AM",
  lunch: "12:30 PM - 2:30 PM",
  snacks: "4:30 PM - 6:00 PM",
  dinner: "7:00 PM - 9:00 PM"
};
