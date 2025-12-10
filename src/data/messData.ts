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
  breakfast: "Bread, butter, jam, milk, tea, coffee, sprouts/chana, Fruit (based on market availability), Boiled egg (5×/week), Omelette (2×/week)",
  sides: "Seasonal fruit, mix pickle, papad, mix salad, onion, lemon",
  snacksDinner: "Tea, coffee, sugar, appalam, mixed salad, pickle (mango/chili/mix)"
};

// Week 1 & 3 Menu (Updated 13/11)
export const week1and3Menu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha", "Ketchup", "Curd", "Mint & Coriander Chutney"] }],
    Lunch: [{ meal: "Lunch", items: ["Phulka", "White Rice", "Kerala Rice", "Chana (White) Masala", "Arhar Dal (Pigeon Pea)", "Sambar", "Chutney", "Curd"] }],
    Snacks: [{ meal: "Snacks", items: ["Onion Kachori", "Tomato Ketchup", "Fried Chilly"] }],
    Dinner: [{ meal: "Dinner", items: ["Fried Rice", "Phulka", "Dal Tadka", "Gobhi Manchurian"] }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Masala Dosa", "Tomato Chutney", "Sambar"] }],
    Lunch: [{ meal: "Lunch", items: ["Puri", "Aloo Palak", "Sambar", "Ridge Gourd (Dry)", "White Rice", "Buttermilk", "Seasonal Fruit (Watermelon)", "Kerala Rice"] }],
    Snacks: [{ meal: "Snacks", items: ["Aloo Bonda (>60 gm)", "Tomato Ketchup"] }],
    Dinner: [{ meal: "Dinner", items: ["Phulka", "Chole Masala", "Jeera Rice", "Dal (Mix Veg.)", "Raita", "Ice Cream"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Dal Khichdi", "Coconut Chutney", "Dahi Boondi (Small Cup)", "Peanut Butter"], nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "White Rice", "Green Peas Masala", "Kerala Rice", "Onion Raita (Thick)", "Rasam", "Chana Dal Fry"] }],
    Snacks: [{ meal: "Snacks", items: ["Green Matar Chat"] }],
    Dinner: [{ meal: "Dinner", items: ["White Rice", "Moong Dal", "Paratha", "Laddu", "Lemon"], veg: "Hyderabadi Paneer Dish", nonVeg: "Hyderabadi Style Chicken Masala" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Puri", "Chana (White) Masala"] }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "White Rice", "Mix Dal", "Malai Kofta", "Bottle Gourd Dry", "Curd"] }],
    Snacks: [{ meal: "Snacks", items: ["Tikki Chat"] }],
    Dinner: [{ meal: "Dinner", items: ["Spl Dal", "Sambar", "Masala Dosa (Unlimited)", "White Rice", "Tomato Chutney / Coriander Chutney", "Coconut Chutney", "Payasam", "Rasam"] }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Fried Idli", "Vada", "Sambar", "Coconut Chutney"], nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Phulka", "White Rice", "Kadai Veg", "Sambar", "Potato Cabbage Dry", "Buttermilk"] }],
    Snacks: [{ meal: "Snacks", items: ["Pungulu with Coconut Chutney"] }],
    Dinner: [{ meal: "Dinner", items: ["Pulao", "Mix Dal", "Chapathi", "Mango Pickle", "Lemon", "Badhusha"], nonVeg: "Chicken Gravy", veg: "Paneer Butter Masala" }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Gobi Mix Veg Paratha", "Ketchup", "Green Coriander Chutney", "Peanut Butter"] }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "White Rice", "Rajma Masala", "Green Vegetable (Dry)", "Ginger Dal", "Gongura Chutney", "Curd"] }],
    Snacks: [{ meal: "Snacks", items: ["Samosa", "Tomato Ketchup", "Cold Coffee"] }],
    Dinner: [{ meal: "Dinner", items: ["Phulka", "Green Peas Masala", "White Rice", "Raw Banana Poriyal", "Rasam", "Buttermilk"] }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Onion Rava Dosa", "Tomato Chutney", "Sambar"] }],
    Lunch: [{ meal: "Lunch", items: ["Shorba Masala", "Onion Raita (Thick)", "Aam Panna", "Dum Biryani"], nonVeg: "Chicken Dum Biryani", veg: "Chilli Paneer" }],
    Snacks: [{ meal: "Snacks", items: ["Vada Pav", "Fried Green Chilly", "Green Coriander Chutney"] }],
    Dinner: [{ meal: "Dinner", items: ["Arhar Dal Tadka", "Aloo Fry", "Kadhi Pakoda", "Rice", "Chapathi", "Gulab Jamun"] }]
  }
};

// Week 2 & 4 Menu (Updated 13/11)
export const week2and4Menu: WeekMenu = {
  Monday: {
    Breakfast: [{ meal: "Breakfast", items: ["Aloo Paratha", "Ketchup", "Curd", "Seasonal Fruit", "Mint & Coriander Chutney"] }],
    Lunch: [{ meal: "Lunch", items: ["Phulka", "Ghee Rice", "Aloo Chana Masala", "Soya Chilly (Semi-Dry)", "Rasam", "Chutney", "Buttermilk"] }],
    Snacks: [{ meal: "Snacks", items: ["Macroni"] }],
    Dinner: [{ meal: "Dinner", items: ["Raita", "Mutter Masala", "Chana Dal Tadka", "Phulka", "Makkan Peda", "White Rice"], veg: "Paneer Biryani", nonVeg: "Egg Biryani" }]
  },
  Tuesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Upma", "Vada", "Coriander Chutney", "Curd"] }],
    Lunch: [{ meal: "Lunch", items: ["Chola Bhatura", "Toor Dal Fry", "Watermelon", "Green Mix Vegetables (Dry)", "Lemon Rice", "Curd"] }],
    Snacks: [{ meal: "Snacks", items: ["Dahi Papdi Chat"] }],
    Dinner: [{ meal: "Dinner", items: ["Phulka", "White Rice", "Methi Dal", "Mix Veg (Dry)", "Sambar", "Ice Cream"] }]
  },
  Wednesday: {
    Breakfast: [{ meal: "Breakfast", items: ["Puttu", "Kadala Curry", "Peanut Butter"], nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "Methi Dal", "Drumstick Gravy", "Dondakaya Dry", "Rasam", "Buttermilk"] }],
    Snacks: [{ meal: "Snacks", items: ["Mysore Bonda"] }],
    Dinner: [{ meal: "Dinner", items: ["Pulao", "Mix Dal", "Tawa Butter Naan", "Mango Pickle", "Lemon"], nonVeg: "Kadai Chicken", veg: "Kadai Paneer" }]
  },
  Thursday: {
    Breakfast: [{ meal: "Breakfast", items: ["Mini Chola Bhatura", "Seasonal Fruit"] }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "Mutter Paneer Masala", "Coriander Rice", "Kollu Rasam", "Potato Chips", "Dalpodhi", "Curd"] }],
    Snacks: [{ meal: "Snacks", items: ["Cutlet", "Tomato Ketchup"] }],
    Dinner: [{ meal: "Dinner", items: ["Arhar Dal Tadka", "Aloo Fry", "Kadhi Pakoda", "White Rice", "Chapathi", "Mysore Pak"] }]
  },
  Friday: {
    Breakfast: [{ meal: "Breakfast", items: ["Podi Dosa", "Sambar", "Tomato Chutney", "Peanut Butter"] }],
    Lunch: [{ meal: "Lunch", items: ["Phulka", "Navadhanya Masala", "Sambar", "Green Mix Veg (without Aloo)", "Rasam", "Watermelon Juice"] }],
    Snacks: [{ meal: "Snacks", items: ["Pani Puri"] }],
    Dinner: [{ meal: "Dinner", items: ["Pulao", "Mix Dal", "Chapathi", "Fruit Vermicelli Sheera"], nonVeg: "Chicken Gravy", veg: "Paneer Butter Masala" }]
  },
  Saturday: {
    Breakfast: [{ meal: "Breakfast", items: ["Mix-Veg Paratha", "Mint Chutney", "Curd", "Ketchup"], nonVeg: "Omelette" }],
    Lunch: [{ meal: "Lunch", items: ["Chapathi", "Green Peas Pulao", "Spinach Dal", "Gobhi Capsicum Dry Butter Masala", "Cabbage Chutney", "Masala Buttermilk"] }],
    Snacks: [{ meal: "Snacks", items: ["Samosa", "Tomato Ketchup", "Cold Coffee"] }],
    Dinner: [{ meal: "Dinner", items: ["Dal Makhani", "Aloo Brinjal (Dry)", "Sambar", "Phulka", "White Rice", "Kheer"] }]
  },
  Sunday: {
    Breakfast: [{ meal: "Breakfast", items: ["Andhra Kara Dosa", "Peanut Chutney", "Sambar"] }],
    Lunch: [{ meal: "Lunch", items: ["Puri", "Biryani Rice", "Chana Dal Tadka", "Raita", "Fruit Juice"], nonVeg: "Chicken Masala (Spicy)", veg: "Paneer Masala (Spicy)" }],
    Snacks: [{ meal: "Snacks", items: ["Pav Bhaji"] }],
    Dinner: [{ meal: "Dinner", items: ["Phulka", "Baby Aloo Masala", "Soya Chilli (Semi Dry)", "White Rice", "Dal (Thick)", "Rasam"] }]
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
