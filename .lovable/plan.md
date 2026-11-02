# People & Access — Dynamic Company Organization

## যা তৈরি হবে

কোম্পানি প্রোফাইলের **People & Access** ট্যাবটি বাস্তব কর্মীদের দিয়ে সাজানো আধুনিক organization workspace হবে। ছবির মতো CEO থেকে নেতৃত্ব, টিম ও কর্মীদের সংযোগ দেখা যাবে; কোনো কাল্পনিক কর্মী বা টিম যোগ করা হবে না।

### 1. Organization view
- উপরে People, Teams এবং Company admins-এর বাস্তব সংখ্যা।
- **Organization / People / Teams** ভিউ বদলানোর ব্যবস্থা।
- CEO এবং COO-এর পরিচয়, আসল ছবি থাকলে ছবি, না থাকলে initials। নিচে reporting line অনুযায়ী কর্মীদের সংযুক্ত কার্ড।
- টিমের আলাদা রঙিন পরিচয়, টিম লিড, সদস্যসংখ্যা এবং সদস্যদের ছবি। বিদ্যমান Branta রঙ ও ছোট, পরিষ্কার কার্ড বজায় থাকবে—ছবির বেগুনি থিম কপি করা হবে না।
- Zoom in/out, fit view, drag-to-pan, branch collapse এবং team filter। কর্মীর কার্ডে ক্লিক করলে তার তথ্য ও দায়িত্বের drawer খুলবে।
- ফোনের ছোট পর্দায় ব্যবহারযোগ্য তালিকা ভিউও থাকবে; বড় chart অনুভূমিকভাবে দেখা যাবে।

### 2. Dynamic teams
- **Add team**: নাম, পরিচয়রঙ, ঐচ্ছিক parent team ও team lead নির্বাচন।
- একই কর্মী একাধিক টিমে থাকতে পারবেন; কোম্পানির বাইরের কর্মীকে আগে কোম্পানিতে যুক্ত করতে হবে।
- টিমের নাম, নেতৃত্ব, সদস্য ও প্রদর্শনের ক্রম পরিবর্তন করা যাবে।
- টিম archive করলে ইতিহাস থাকবে; সদস্যরা কোম্পানি থেকে মুছে যাবেন না।

### 3. People & reporting
- Group-এর বিদ্যমান সক্রিয় employee list থেকে কর্মী কোম্পানিতে যোগ করা যাবে।
- প্রত্যেকের **company designation**, **reports to**, **team membership** এবং **company access role** পৃথকভাবে সেট করা যাবে।
- Reporting editor দিয়ে কে কার নিচে থাকবে বদলানো যাবে; chart সঙ্গে সঙ্গে সেভ করা তথ্য থেকে আপডেট হবে।
- নাম/employee code দিয়ে search, team/role filter এবং unassigned members আলাদা করে দেখা যাবে।
- কর্মী সরানো মানে শুধু এই কোম্পানির membership নিষ্ক্রিয় করা—Group employee account বা অন্য কোম্পানির সম্পর্ক বদলাবে না। অপসারণের আগে confirmation থাকবে।

### 4. Access safeguards
- CEO/COO-এর বর্তমান automatic **company super admin** অধিকার বজায় থাকবে। এই পেজ থেকে তাঁদের access নামানো বা membership সরানো যাবে না; leadership পরিবর্তন আগের Company Info নিয়মেই হবে।
- Company designation যেমন Designer/Team Lead কোনো access permission দেবে না। Access role আলাদাভাবে **Member / Company admin** হিসেবে থাকবে; Group role অপরিবর্তিত।
- Group-এর অনুমোদিত admins এবং ঐ কোম্পানির অনুমোদিত managers-ই পরিবর্তন করতে পারবেন; অন্যান্য অনুমোদিত কোম্পানি সদস্যের জন্য read-only view।
- নিজেকে নিজের manager করা, circular reporting, circular parent-team structure এবং অন্য কোম্পানির manager/team নির্বাচন বন্ধ থাকবে।
- এই কাজ Finance, employee login, app permissions বা অন্য কোম্পানির ডাটা অ্যাক্সেস পরিবর্তন করবে না।

## Save ও interaction
- প্রতিটি drawer/form-এ নিজস্ব **Save / Cancel**; নতুন global save নয়।
- Searchable employee selectors, loading/empty/error/retry states, saving feedback এবং সফল পরিবর্তনের পর chart ও counts refresh।
- বিদ্যমান semantic colors, employee avatar ও পরিচয় ব্যবহার; ছোট transition এবং reduced-motion সমর্থন।

## Technical implementation
- `company_members`-এর বিদ্যমান company access role পুনঃব্যবহার; designation/reporting তথ্য আলাদা fields, teams এবং many-to-many team memberships আলাদা company-scoped tables।
- একই migration-এ explicit grants, RLS, company-bound relationships এবং reporting/team cycle validation। অনুমোদিত mutations transactional হবে; concurrent edits-এও cycle ও leadership protection বহাল থাকবে।
- নতুন authenticated company-people server functions; reads caller-scoped, writes company permission যাচাই করে। Employee picker-এ প্রয়োজনীয় পরিচয় মাত্র—auth user তালিকা বা private employee তথ্য নয়।
- Company profile-এর placeholder বদলে ছোট, পৃথক People & Access modules। Chart-এর pan/zoom/layout-এর জন্য পরিচিত React graph library; persisted hierarchy থেকে layout তৈরি হবে। Reporting পরিবর্তন editor-এ, canvas drag দিয়ে accidental reporting change নয়।
- Tests: company isolation, active membership, CEO/COO protection, multi-team assignments, self/circular reporting, parent-team cycles এবং archive আচরণ।
- বর্তমান প্রকল্প external Supabase হওয়ায় authenticated live verification-এর managed session নেই; উপলব্ধ public/runtime checks ও automated tests করা হবে, sign-in প্রয়োজন এমন create/edit flow যাচাই না হলে তা স্পষ্ট জানানো হবে।

## এই কাজের বাইরে
Payroll, finance permissions, project/task assignment এবং সম্পূর্ণ কোম্পানিভিত্তিক CRM rollout এই ট্যাবের কাজ নয়। এখানে তৈরি team/designation কোনো বিদ্যমান module-এ নতুন ক্ষমতা দেয় না।