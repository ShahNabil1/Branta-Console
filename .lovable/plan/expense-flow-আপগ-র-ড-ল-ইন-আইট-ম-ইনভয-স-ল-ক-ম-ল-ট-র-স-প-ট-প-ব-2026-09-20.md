# Expense Flow আপগ্রেড — লাইন আইটেম, ইনভয়েস লিংক, মাল্টি-রিসিপ্ট, পাবলিক শেয়ার

এক্সপেন্স এখন একটা ছোট ডকুমেন্ট হবে: কোন প্রোজেক্টের (ইনভয়েস) জন্য খরচ, কী কী কিনলাম (কোয়ানটিটি সহ), কে চাইল, কে টাকা দিল, প্রমাণ কী কী — সব এক জায়গায়, এবং সেটাই ভাউচার PDF-এ ও শেয়ার লিংকে দেখা যাবে।

## ১. Add / Edit Expense ফর্ম (নতুন)

- **Linked invoice** — সার্চেবল ড্রপডাউন (ইনভয়েস নং, কাস্টমারের নাম, টাইটেল দিয়ে খোঁজা যাবে)। সিলেক্ট করলে নিচে দেখাবে: ইনভয়েস টোটাল, এই পর্যন্ত মোট খরচ, বাকি।
  - নিচে চেকবক্স **"Count as project cost"** — টিক দিলে এই খরচ ইনভয়েসের প্রজেক্ট কস্টে যোগ হবে এবং Net Distributable কমবে (স্ট্যাকহোল্ডার শেয়ার নেট থেকেই হিসাব হবে)। টিক না দিলে শুধু তালিকা ও যোগফল দেখাবে, হিসাব অপরিবর্তিত।
- **Paid by** — এমপ্লয়ী সিলেক্টর (যিনি আসলে টাকা দিয়েছেন), Requested by-এর মতোই।
- **Purpose / Note** — এক লাইনের Input বদলে বড় টেক্সট বক্স (multi-line)।
- **Line items (ডায়নামিক)** — যত খরচের আইটেম দরকার তত সারি:
  | Item | Qty | Unit | Unit price | Total | Note |
  উদাহরণ: `Domain brantatech.com | 2 | year | 1,200 | 2,400`, `Lovable credits | 500 | credit | 4 | 2,000`, `Magnifik subscription | 1 | month | 3,500 | 3,500`।
  - Item নামে অটো-সাজেশন লিস্ট (Domain, Hosting, SSL, Third-party API, Lovable credits, Magnifik, Ads budget, Freelancer, Transport…) — কিন্তু যেকোনো নাম টাইপ করা যাবে, তাই যেকোনো ধরনের খরচেই কাজ করবে।
  - Unit-ও ফ্রি টেক্সট + সাজেশন (year, month, credit, pcs, hour, GB)।
  - আইটেম থাকলে মোট Amount অটো যোগ হয়ে বসবে (চাইলে ম্যানুয়ালি ওভাররাইডও করা যাবে, তবে মিল না থাকলে সতর্কবার্তা)। আইটেম না দিলে আগের মতোই শুধু Amount দিয়ে সিম্পল এক্সপেন্স করা যাবে।
- **Receipts / Proof — সর্বোচ্চ ২০টা** — একসাথে একাধিক ফাইল (ছবি/PDF, প্রতিটি ≤ ১৫ MB)। প্রতিটার পাশে **Caption** লেখার ঘর (যেমন "Namecheap domain invoice"), থাম্বনেইল প্রিভিউ, রি-অর্ডার ও ডিলিট। পুরোনো একক receipt অটো প্রথম অ্যাটাচমেন্ট হিসেবে চলে আসবে — কিছু হারাবে না।

## ২. ভাউচার PDF (A to Z)

একই Voucher No (`EXP-2609-016`) থাকবে, আলাদা কোনো slug নয়। PDF-এ যোগ হবে:

- **Linked invoice** — ইনভয়েস নম্বর, কাস্টমারের নাম, প্রোজেক্ট টাইটেল (শুধু "—" নয়)।
- **Paid by** — কর্মীর নাম ও আইডি; সাথে Requested by, Department।
- **Purpose / Note** — বড়, বোল্ড, নিজের বক্সে, একাধিক লাইনে wrap হবে।
- **Line items টেবিল** — Item / Qty / Unit / Unit price / Total, নিচে Grand total + amount in words।
- **Attachments** — রিসিপ্ট ছবিগুলো ক্যাপশনসহ পরের পেজে গ্রিড করে বসবে; PDF রিসিপ্ট হলে নাম ও লিংক তালিকায় থাকবে।
- **Signed copy** — সিল-স্বাক্ষরিত কপি আপলোড থাকলে সেটাও শেষ পেজে যুক্ত হবে।
- Print mode-এ (প্রি-প্রিন্টেড লেটারহেড) আগের মতোই উপরে/নিচে ফাঁকা থাকবে।

## ৩. পাবলিক শেয়ার লিংক

- প্রতি এক্সপেন্সে **Share** টগল — ডিফল্ট বন্ধ। চালু করলে র‍্যান্ডম টোকেনসহ লিংক তৈরি হবে: `console.brantatech.com/x/EXP-2609-016?t=…`
- লিংকে লগইন ছাড়াই দেখা যাবে: ভাউচারের সব তথ্য, লাইন আইটেম, রিসিপ্ট ছবি (ক্যাপশনসহ), সাইনড কপি, আর "Download PDF" বাটন।
- টগল বন্ধ করলে বা টোকেন রিসেট করলে পুরোনো লিংক সাথে সাথে অচল।

## ৪. ইনভয়েসের সাথে সম্পূর্ণ হিসাব

ইনভয়েস ডিটেইল পেজে নতুন **Project expenses** সেকশন: এই ইনভয়েসে ট্যাগ করা সব এক্সপেন্স (ভাউচার নং, তারিখ, আইটেম, অ্যামাউন্ট, "project cost" কিনা), মোট, এবং সারাংশ —

```text
Invoice total            50,000
− Project cost/expense   10,000
= Net distributable      40,000
   Developer  (37.5%)    15,000
   Broker     (12.5%)     5,000
   Company    (50%)      20,000
```

এক্সপেন্স লিস্টেও নতুন কলাম: Invoice, Items, Receipts সংখ্যা, Share অন/অফ।

## টেকনিক্যাল নোট

- মাইগ্রেশন: `expense_items` (expense_id, sequence, name, qty, unit, unit_price, amount, note) এবং `expense_attachments` (expense_id, sequence, path, caption, mime, size, kind: receipt|signed)। `expenses`-এ `is_project_cost boolean default false`, `share_enabled boolean default false`, `share_token text unique`। প্রতিটায় GRANT + RLS (finance/super_admin লিখবে; পাবলিক রিড হবে শুধু সার্ভার সাইড admin client দিয়ে টোকেন যাচাইয়ের পরে)। পুরোনো `receipt_url` → `expense_attachments`-এ ব্যাকফিল, কলাম রাখা হবে (কিছু ভাঙবে না)।
- `is_project_cost` টিক দিলে ট্রিগার/সার্ভার ফাংশন ইনভয়েসের `invoice_project_costs`-এ মিরর সারি রাখবে এবং `project_cost_total` + পেআউট রিক্যালকুলেশন বিদ্যমান লজিক দিয়েই চলবে — নতুন হিসাব নয়, বিদ্যমানটাই রিইউজ।
- সার্ভার ফাংশন: `createExpense`/`updateExpense` items + attachments সহ (একটাই ট্রানজ্যাকশন-সদৃশ কল), `listExpenses` items/attachment count সহ, `setExpenseShare({id, enabled})`, `getExpenseAttachmentUrl` (signed URL)।
- আপলোড আগের মতোই প্রাইভেট `expense-receipts` বাকেটে, `receipts/<uid>/…` প্রিফিক্সে; পাবলিক পেজে ছবি সার্ভার-সাইড signed URL দিয়ে দেখানো হবে।
- PDF: `renderExpenseVoucherPdf` (src/lib/invoice-pdf.server.ts) আপডেট — items টেবিল, বড় Purpose ব্লক, attachment পেজ (pdf-lib দিয়ে JPEG/PNG embed), signed copy পেজ; `loadExpenseVoucherPayload` items/attachments/invoice+customer আনবে।
- নতুন পাবলিক রুট `src/routes/x.$voucher.tsx` (টোকেন যাচাই করে সার্ভার fn থেকে ডাটা) — বিদ্যমান `/api/public/expenses/$voucher.pdf` স্বাক্ষরিত PDF রুট অপরিবর্তিত থাকবে, শেয়ার পেজ থেকেও সেটাই ব্যবহার হবে।
- বিদ্যমান ফিল্টার, এক্সপোর্ট, নোটিফিকেশন, পারমিশন, রেসপন্সিভ কার্ড লেআউট সব অক্ষুণ্ন থাকবে; মোবাইলে আইটেম ও রিসিপ্ট কার্ড আকারে দেখাবে।

## ধাপে বাস্তবায়ন

1. মাইগ্রেশন + ব্যাকফিল
2. সার্ভার ফাংশন (items, attachments, share)
3. Add/Edit ফর্ম + লিস্ট UI
4. ভাউচার PDF আপগ্রেড
5. পাবলিক শেয়ার পেজ + ইনভয়েসে Project expenses সেকশন
