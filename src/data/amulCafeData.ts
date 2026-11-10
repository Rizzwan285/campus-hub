// Transcribed from amul_cafe_sangraha_menu.md supplied on 2026-11-10.
interface AmulMenuItem {
  name: string;
  price: number;
  detail?: string;
}

interface AmulMenuSection {
  title: string;
  items: AmulMenuItem[];
}

export const amulCafe = {
  name: 'Amul Cafe',
  location: 'Sangraha, near the Football Ground, IIT Palakkad',
  phone: '9447324287',
  deliveryHours: '12:00 noon–6:00 PM',
  closingTime: '11:00 PM',
  deliveryCharge: 15,
};

export const amulMenuSections: AmulMenuSection[] = [
  {
    title: 'Chicken Burgers',
    items: [
      { name: 'Chicken Burger', price: 90 },
      { name: 'Chicken Cheese Burger', price: 110 },
      { name: 'Chicken Double Cheese Burger', price: 130 },
      { name: 'Double Patty (Jumbo) Chicken Burger', price: 160 },
    ],
  },
  {
    title: 'Veg Burgers',
    items: [
      { name: 'Veg Burger', price: 70 },
      { name: 'Veg Cheese Burger', price: 90 },
      { name: 'Veg Double Cheese Burger', price: 110 },
      { name: 'Double Patty (Jumbo) Veg Burger', price: 110 },
      { name: 'Veg Paneer Burger', price: 100 },
    ],
  },
  {
    title: 'Maggi',
    items: [
      { name: 'Veg Maggi', price: 50 },
      { name: 'Veg Cheese Maggi', price: 70 },
      { name: 'Veg Paneer Maggi', price: 70 },
    ],
  },
  {
    title: 'Snacks',
    items: [
      { name: 'Chicken Nuggets', detail: '5 pcs', price: 50 },
      { name: 'Veg Nuggets', detail: '8 pcs', price: 50 },
      { name: 'Veg Momos (Fried)', detail: '5 pcs', price: 50 },
      { name: 'Chicken Momos (Fried)', detail: '5 pcs', price: 60 },
      { name: 'French Fries – Salt & Pepper', price: 80 },
      { name: 'French Fries – Peri Peri', price: 80 },
    ],
  },
  {
    title: 'Shakes',
    items: [
      { name: 'Ice Cream Shake', detail: 'Any flavour', price: 90 },
      { name: 'Fruit Pulp Shake', detail: 'Any flavour', price: 70 },
    ],
  },
];
