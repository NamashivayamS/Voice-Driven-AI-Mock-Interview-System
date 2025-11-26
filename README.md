# AI Voice Mock Interview System

An intelligent, voice-based mock interview platform that uses Natural Language Processing (NLP) to evaluate candidate responses in real-time. The system provides automated scoring based on content relevance and speech fluency metrics.

## 🎯 Features

- **Voice-Based Interview**: Interactive voice interview using browser's Web Speech API
  - Text-to-Speech (TTS) for question delivery
  - Automatic Speech Recognition (ASR) for candidate responses
  - Microphone selection support

- **AI-Powered Scoring**:
  - **Content Score**: Semantic similarity analysis using Sentence Transformers
  - **Fluency Score**: Words Per Minute (WPM) and filler word detection
  - **Overall Score**: Weighted combination (70% content + 30% fluency)

- **Comprehensive Question Bank**:
  - Multiple categories: General, Technical, Software, Data Science, Aptitude
  - Questions loaded from JSON and CSV files
  - Randomized question order for variety

- **Detailed Feedback**:
  - Real-time scorecards with color-coded performance indicators
  - Content feedback based on semantic similarity
  - Fluency metrics (WPM, filler word rate, duration)

## 🛠️ Technology Stack

### Backend
- **Flask**: Web framework for API endpoints
- **Sentence Transformers**: NLP model (`all-MiniLM-L6-v2`) for semantic similarity
- **Pandas**: Data handling for CSV question files
- **NumPy & SciPy**: Numerical computations

### Frontend
- **HTML5**: Structure and layout
- **CSS3**: Styling and responsive design
- **JavaScript**: 
  - Web Speech API for voice recognition
  - Chart.js for visualizations (prepared but not fully implemented)
  - Fetch API for backend communication

## 📁 Project Structure

```
NLP_Mock_Interview/
│
├── backend/
│   ├── api.py              # Flask API server with endpoints
│   ├── scorer.py           # NLP scoring logic and model loading
│   ├── questions.json      # Question bank (JSON format)
│   └── Software Questions.csv  # Additional questions (CSV format)
│
├── frontend/
│   ├── index.html          # Main application interface
│   ├── script.js           # Frontend logic and voice handling
│   └── style.css           # Styling
│
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

## 🚀 Installation

### Prerequisites
- Python 3.7 or higher
- pip (Python package manager)
- Modern web browser with Web Speech API support (Chrome, Edge, Safari)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd NLP_Mock_Interview
   ```

2. **Create a virtual environment** (recommended)
   ```bash
   python -m venv venv
   ```

3. **Activate the virtual environment**
   - **Windows:**
     ```bash
     venv\Scripts\activate
     ```
   - **macOS/Linux:**
     ```bash
     source venv/bin/activate
     ```

4. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

5. **Start the Flask server**
   ```bash
   cd backend
   python api.py
   ```
   
   The server will start on `http://127.0.0.1:5000`

6. **Open the application**
   - Navigate to `http://127.0.0.1:5000` in your browser
   - Allow microphone permissions when prompted

## 📖 Usage

1. **Start the Interview**:
   - Wait for questions to load (status will show "Ready!")
   - Click "Start Interview" button

2. **Answer Questions**:
   - The system will speak each question using TTS
   - Click "Start Speaking" when ready to answer
   - Speak your response clearly into the microphone
   - The system will automatically stop after 2 seconds of silence
   - You can also manually stop by clicking "Stop Speaking"

3. **View Feedback**:
   - After each response, you'll receive a detailed scorecard
   - Scores are color-coded:
     - 🟢 Green: 80% and above (Good)
     - 🟡 Yellow: 50-79% (Average)
     - 🔴 Red: Below 50% (Needs Improvement)
   - The next question will appear automatically after 3 seconds

4. **Interview Completion**:
   - The interview continues through all questions
   - Review your performance feedback at the end

## 🔌 API Endpoints

### `GET /interview/start`
Returns the list of available questions.

**Response:**
```json
{
  "status": "success",
  "questions": [
    {
      "id": 0,
      "category": "General",
      "question": "Hello, welcome to your mock interview...",
      "answers": [...],
      "keywords": [...],
      "explanation": "..."
    }
  ]
}
```

### `POST /interview/score`
Scores a candidate's response.

**Request Body:**
```json
{
  "question_id": 0,
  "transcript": "I am a data science student...",
  "duration_seconds": 15.5
}
```

**Response:**
```json
{
  "status": "success",
  "report": {
    "question_id": 0,
    "transcript": "I am a data science student...",
    "overall_score": 85.5,
    "content": {
      "score": 88.2,
      "feedback": "Excellent! Your answer is semantically very close to the ideal response."
    },
    "fluency": {
      "score": 80.0,
      "wpm": 145,
      "word_count": 35,
      "duration_seconds": 15.5,
      "filler_count": 2,
      "filler_rate": 5.7,
      "feedback": "Pacing: Your pacing is within the optimal range (130-170 WPM). | Fillers: Moderate use of filler words (5.7%) detected."
    }
  }
}
```

## ⚙️ Configuration

### Scoring Parameters (in `backend/scorer.py`)

- **Model**: `all-MiniLM-L6-v2` (Sentence Transformer)
- **WPM Target Range**: 130-170 words per minute
- **Content Weight**: 70%
- **Fluency Weight**: 30%
- **Filler Words**: ["um", "uh", "like", "you know", "so", "actually", "basically", "i mean", "right"]

### Adding Questions

1. **JSON Format** (`backend/questions.json`):
   ```json
   {
     "id": 100,
     "category": "Technical",
     "question": "Your question here?",
     "answers": ["Ideal answer 1", "Ideal answer 2"],
     "keywords": ["keyword1", "keyword2"],
     "explanation": "Explanation of what the question tests"
   }
   ```

2. **CSV Format** (`backend/Software Questions.csv`):
   - Columns: `Category`, `Question`, `Answer`, `Difficulty`
   - Questions are automatically assigned unique IDs

## 🎤 Browser Compatibility

- **Chrome/Edge**: Full support for Web Speech API
- **Safari**: Full support for Web Speech API
- **Firefox**: Limited support (may require additional configuration)

**Note**: Microphone permissions are required for voice input functionality.

## 🔧 Troubleshooting

### Server Connection Issues
- Ensure Flask server is running on port 5000
- Check firewall settings
- Verify `http://127.0.0.1:5000` is accessible

### Microphone Issues
- Grant microphone permissions in browser settings
- Check microphone selection dropdown
- Ensure microphone is not being used by another application
- Try refreshing the page and re-granting permissions

### Model Loading Issues
- First run will download the Sentence Transformer model (~80MB)
- Ensure stable internet connection for initial setup
- Model is cached after first download

### Speech Recognition Not Working
- Check browser console for errors
- Verify Web Speech API is supported in your browser
- Try using Chrome or Edge for best compatibility

## 📝 Notes

- The visualization feature (Chart.js) is prepared in the HTML but not fully implemented in the JavaScript
- Questions are shuffled after the first 3 introductory questions
- The system automatically stops recording after 2 seconds of silence
- All scores are calculated in real-time using semantic similarity

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available for educational purposes.

## 👨‍💻 Author

Developed by Namashivayam S.

---

**Note**: This is a mock interview system designed for practice purposes. The scoring is automated and should be used as a learning tool rather than a definitive assessment.

