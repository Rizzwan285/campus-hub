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

// Common items available all days
export const commonItems = {
  breakfast: "Bread, Butter, Jam, Tea, Coffee, Milk, Sprouts/Channa, Fruits, Cornflakes/Bournvita/Oats, Egg",
  lunch: "Pickle, Pappad, Mix Salad, White Rice, Kerala Rice, Curd, Phulka/Ghee Roti",
  snacks: "Tea, Coffee, Sugar/Dry Snacks Extra",
  dinner: "Appalam, Mixed Salad, Pickle (Mango, Chilli, Mix), White Rice, Kerala Rice"
};

// Kedaram Mess Menu (Same for all weeks)
export const kedaramMessMenu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Idli", "Vada", "Chutney", "Sambhar", "Boiled Egg/Banana"] }],
    Lunch: [{ meal: "Lunch", items: ["Chawali Masala", "Aloo Palak Dry", "Dal Palak", "Kollu Rasam", "Kokam Juice"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Snack Gourd Dry Veg", "Mix Dal", "Andhra Rasam", "Ice Cream"], veg: "Paneer Butter Masala", nonVeg: "Egg Masala" }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Pav Bhaji", "Appam", "Veg Stew", "Boiled Egg/Banana"] }],
    Lunch: [{ meal: "Lunch", items: ["Green Peas Masala", "Aloo Bhindi Dry", "Dal Tadka", "Sambhar", "Watermelon Juice"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Veg Tawa", "Black Chana Masala", "Moong Dal Tadka", "Rasam Kokam", "Pineapple Sheera"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Upma", "Poha", "Chutney"], nonVeg: "Omelette", veg: "Mix Fruits" }],
    Lunch: [{ meal: "Lunch", items: ["Rajma Masala", "Mix Veg Dry", "Dal Kolhapuri", "Jal Jeera", "Puri", "Sambhar"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Ghee Rice", "Dry Veg", "Dal Tomato", "Gulab Jamun", "Rasam", "Palak Paratha"], veg: "Paneer Butter Masala", nonVeg: "Chicken Masala" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Podi Dosa", "Red Chutney", "Sambhar"], nonVeg: "Omelette", veg: "Kerala Banana" }],
    Lunch: [{ meal: "Lunch", items: ["Palak Khichdi", "Kadhi Pakoda", "Mix Veg Dry", "Sambhar", "Pineapple Juice"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Chole Masala", "Cabbage Poriyal", "Andhra Rasam", "Dal Palak", "Vermicelli Kheer"] }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Puri", "Aloo Tomato Sabji", "Idiyappam", "Kadala Curry", "Boiled Egg/Cut Fruits"] }],
    Lunch: [{ meal: "Lunch", items: ["Carrot Beans Dry", "Paneer Kadhai", "Dal Fry", "Kokam Rasam", "Juice"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Mix Whole Pulses", "Dal", "Coconut Burfi", "Sambhar", "Chapati"], veg: "Paneer Do Pyaza", nonVeg: "Chicken Curry" }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha", "Curd", "Poha", "Chutney", "Pickle", "Tomato Sauce"], nonVeg: "Omelette", veg: "Cut Fruits" }],
    Lunch: [{ meal: "Lunch", items: ["Jeera Rice", "Baingan Masala", "Tawa Veg", "Sambhar", "Lime Juice", "Mix Dal"] }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Veg Fried Rice", "Veg Noodles/Veg Manchurian", "Soya Bean Masala", "Chana Dal", "Rasam", "Moong Dal Payasam"] }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Masala Dosa", "Coconut Chutney", "Sambhar", "Boiled Egg/Banana"] }],
    Lunch: [{ meal: "Lunch", items: ["Veg Raita", "Dal Pappu", "Dry Veg Seasonal", "Lemon Juice", "Triangle Paratha", "Rasam"], veg: "Paneer Biryani", nonVeg: "Chicken Biryani" }],
    Snacks: [{ meal: "Snacks", items: ["Tea", "Coffee", "Milk"] }],
    Dinner: [{ meal: "Dinner", items: ["Matar Masala", "Aloo Capsicum", "Mix Veg Sambhar", "Dal Tadka", "Moong Dal Halwa"] }]
  }
};

export const week1and3Menu: WeekMenu = kedaramMessMenu;
export const week2and4Menu: WeekMenu = kedaramMessMenu;

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
