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

// Mess Timings
export interface MessTimings {
  breakfast: string;
  lunch: string;
  snacks: string;
  dinner: string;
}

export const weekdayTimings: MessTimings = {
  breakfast: "7:15am - 9:30am",
  lunch: "12pm - 2:15pm",
  snacks: "4:30pm - 6pm",
  dinner: "7pm - 9pm"
};

export const weekendTimings: MessTimings = {
  breakfast: "8am - 10am",
  lunch: "12:30pm - 2:30pm",
  snacks: "4:30pm - 6pm",
  dinner: "7pm - 9pm"
};
