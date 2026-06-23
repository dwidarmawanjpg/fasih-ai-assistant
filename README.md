# 📊 FASIH AI Assistant

A modern, data-dense intelligent dashboard specifically designed to extract, normalize, and format unstructured field interview notes into structured JSON data for the **FASIH BPS Survey**. 

Built with React, Vite, and HuggingFace LLM, this application acts as a smart companion that understands complex business logic, household structures, and asset valuations.

![FASIH AI Assistant](https://via.placeholder.com/1200x600/0f172a/3b82f6?text=FASIH+AI+Assistant+-+Data+Dense+Dashboard)

## 🌟 Key Features

### 1. 🧠 Intelligent Extraction Engine
- **Automated Categorization**: Sorts raw text into 5 mandatory categories: `Kepala Keluarga`, `ART Lainnya`, `Aset`, `Pengeluaran`, and `Usaha`.
- **Household Separation**: Automatically segregates data for different household members (e.g., Wife, First Child) using the `subCategory` field.
- **Smart Occupation Matching**: Automatically assigns the official BPS 3-digit occupation code (from 185 possible professions) to household members.

### 2. 🧮 Built-in Business & Asset Logic
- **Annual Conversions**: Automatically converts weekly/monthly income and production into 12-month (yearly) projections.
- **Median Interpolation**: Extracts the exact median value when interviewees provide ranges (e.g., "Pendapatan 2-4 juta" becomes "3 juta").
- **Loss Prevention**: Cross-validates business capital against income. If capital exceeds income (deficit), the AI safely inflates income by 50% above capital.
- **Hardcoded Asset Valuations**: Understands fixed land rates (Rp 80M/Are), Motorcycle estimates (Rp 15M), and Gold (Rp 1M/gram).

### 3. 💾 Persistent AI Memory (Supabase)
The AI features a built-in Long-Term Memory (RAG-style Knowledge Base) powered by **Supabase**.
- Teach the AI new logic or corrections directly from the UI via the **"Ajari AI"** modal.
- Rules are saved globally and injected into the AI's prompt for all future sessions across all devices.

### 4. 🎨 UI/UX Pro Max Design System
The UI is built using the **Data-Dense Dashboard** guidelines:
- **Typography**: `Fira Sans` for readability and `Fira Code` for precise numerical/currency alignment.
- **Space Efficiency**: Reduced padding and tight grids to display maximum data without overwhelming the user.
- **Accessibility (A11y)**: Fully compliant form controls, ARIA labels, and reduced motion for loading states.
- **Adaptive Currency Formatting**: Automatically parses and styles Rupiah (`Rp`) currency blocks with distinct colors.

## 🚀 Tech Stack

- **Frontend**: React 18, Vite, Vanilla CSS
- **AI Model**: Combotry (via HuggingFace Inference Endpoint)
- **Database**: Supabase (PostgreSQL) for AI Memory Rules
- **State Management**: React Hooks + LocalStorage (Session History)

## 🛠️ Local Development

### Prerequisites
- Node.js (v18+)
- A free [Supabase](https://supabase.com) account

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd fasih-helper
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Supabase:**
   - Create a new project on Supabase.
   - Run the following query in the SQL Editor:
     ```sql
     create table ai_memory (
       id bigint primary key generated always as identity,
       content text not null,
       created_at timestamp with time zone default timezone('utc'::text, now()) not null
     );
     ```
   - Copy your Project URL and Anon/Public Key.

4. **Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🌐 Deploying to Vercel

This project is optimized for Vercel deployment.

1. Push your code to a GitHub repository.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. In the **Environment Variables** section, add your Supabase keys:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. Vercel will automatically detect the Vite framework and build the project.

---
*Built with ❤️ for FASIH BPS Data Processing.*
