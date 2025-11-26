import json
import os
import re
import pandas as pd
from sentence_transformers import SentenceTransformer
from sentence_transformers.util import cos_sim

# --- Configuration ---
# Lightweight Sentence Transformer model for speed/efficiency
MODEL_NAME = 'all-MiniLM-L6-v2' 
WPM_TARGET_MIN = 130
WPM_TARGET_MAX = 170
FILLER_WORDS = ["um", "uh", "like", "you know", "so", "actually", "basically", "i mean", "right"]
CONTENT_WEIGHT = 0.7
FLUENCY_WEIGHT = 0.3

# --- Global Resources (Loaded once on server start) ---
MODEL = None
QUESTION_BANK = {}
QUESTION_MAP = {} # Map ID to full question object for fast lookup

def load_resources(base_path="."):
    """Loads the SBERT model and the entire question bank data."""
    global MODEL, QUESTION_BANK, QUESTION_MAP

    # 1. Load the SBERT Model
    print(f"Loading Sentence Transformer model: {MODEL_NAME}...")
    try:
        MODEL = SentenceTransformer(MODEL_NAME)
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Error loading model: {e}")
        MODEL = None
        
    # 2. Load Questions from JSON
    json_path = os.path.join(base_path, 'questions.json')
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            json_questions = json.load(f)
            # Use max(id) + 10 to prevent id overlaps when updating from CSV later
            QUESTION_BANK.update({q['id']: q for q in json_questions})
    except Exception as e:
        print(f"Error loading questions.json: {e}")

    # 3. Load Questions from CSV (and convert to JSON-like structure)
    csv_path = os.path.join(base_path, 'Software Questions.csv')
    try:
        # **FIXED:** Using 'latin-1' encoding to handle non-UTF-8 characters
        csv_df = pd.read_csv(csv_path, encoding='latin-1') 
        
        # Determine the maximum existing ID from the JSON data
        max_id = max(QUESTION_BANK.keys()) if QUESTION_BANK else 0
        
        # Convert the CSV format to match the JSON structure
        for index, row in csv_df.iterrows():
            # Generate unique ID starting after the highest JSON ID
            question_id = max_id + index + 1
            max_id = question_id # Update max_id for the next question
            
            # The 'Answer' column might contain line breaks, so strip/clean it
            answer_text = str(row['Answer']).strip().replace('\n', ' ')

            question = {
                'id': question_id,
                'category': row['Category'],
                'question': row['Question'],
                'answers': [answer_text], 
                'keywords': [], 
                'explanation': str(row.get('Answer', '')), 
                'difficulty': row.get('Difficulty', 'Medium')
            }
            QUESTION_BANK[question_id] = question
    except Exception as e:
        print(f"Error loading Software Questions.csv: {e}")

    # 4. Create a unified map and pre-encode ideal answers
    # Pre-encoding speeds up the scoring endpoint later
    for q_id, q_data in QUESTION_BANK.items():
        ideal_answers = [str(a) for a in q_data.get('answers', [])]
        if ideal_answers and MODEL is not None:
            # Encode only once and store the embeddings
            q_data['ideal_embeddings'] = MODEL.encode(ideal_answers)
        QUESTION_MAP[q_id] = q_data

    print(f"Total questions loaded: {len(QUESTION_BANK)}")
    
    # Return a list of questions without the heavy embeddings for the frontend
    frontend_questions = [{k: v for k, v in q.items() if k not in ['ideal_embeddings']} 
                           for q in QUESTION_MAP.values()]
    return frontend_questions

def calculate_content_score(question_id, transcript):
    """Calculates semantic similarity between the candidate's transcript and ideal answers."""
    if MODEL is None or question_id not in QUESTION_MAP:
        return 0, "System Error: Model or Question not loaded."
    
    question_data = QUESTION_MAP[question_id]
    ideal_embeddings = question_data.get('ideal_embeddings')
    ideal_answers = question_data.get('answers')
    
    if ideal_embeddings is None or not ideal_answers:
        return 0, "No ideal answers available for this question."

    # Encode the candidate's transcript
    candidate_embedding = MODEL.encode([transcript])
    
    # Calculate cosine similarity against all ideal answers
    similarities = cos_sim(candidate_embedding, ideal_embeddings)[0]
    
    # The score is the max similarity found
    max_similarity = similarities.max().item() 
    
    # Scale to 100%
    content_score = round(max_similarity * 100, 2)
    
    # --- Basic Content Feedback ---
    best_match_index = similarities.argmax().item()
    best_match_text = ideal_answers[best_match_index]
    
    if content_score >= 85:
        feedback = "Excellent! Your answer is semantically very close to the ideal response."
    elif content_score >= 60:
        feedback = f"Good, but it lacks some depth or specific phrasing. Your answer was closest to: '{best_match_text}'."
    else:
        feedback = f"Your answer needs significant improvement on the core concepts. The expected topic related to: '{best_match_text}'."

    return content_score, feedback

def calculate_fluency_metrics(transcript, duration_seconds):
    """Calculates WPM and filler word metrics and generates a fluency score."""
    
    transcript = transcript.lower()
    
    # 1. Tokenize and Count
    words = re.findall(r'\b\w+\b', transcript)
    word_count = len(words)
    
    duration_minutes = duration_seconds / 60.0
    
    # 2. WPM Calculation
    wpm = (word_count / duration_minutes) if duration_minutes > 0 else 0
    wpm = round(wpm, 2)

    # 3. Filler Detection
    filler_count = sum(1 for word in words if word in FILLER_WORDS)
    filler_rate = (filler_count / word_count) * 100 if word_count > 0 else 0
    filler_rate = round(filler_rate, 2)

    # 4. WPM Scoring (Penalty for deviations from target band 130-170)
    wpm_score = 100 
    wpm_feedback = "Your pacing is within the optimal range (130-170 WPM)."
    
    if wpm < WPM_TARGET_MIN and wpm > 0:
        penalty = (WPM_TARGET_MIN - wpm) * 2.0  # Heavier penalty for being too slow
        wpm_score = max(0, 100 - penalty)
        wpm_feedback = f"Your pacing is too slow ({wpm} WPM). Try to speak more concisely."
    elif wpm > WPM_TARGET_MAX:
        penalty = (wpm - WPM_TARGET_MAX) * 1.0 
        wpm_score = max(0, 100 - penalty)
        wpm_feedback = f"Your pacing is slightly too fast ({wpm} WPM). Slow down for better clarity."
    
    wpm_score = round(wpm_score, 2)

    # 5. Filler Scoring (Penalty based on frequency)
    filler_score = 100
    filler_feedback = "No significant use of filler words detected."
    
    if filler_rate >= 5: # High frequency
        filler_penalty = min(filler_rate * 5, 50)
        filler_score = max(0, 100 - filler_penalty)
        filler_feedback = f"High frequency of filler words ({filler_rate}%) detected. Try to eliminate words like 'um' and 'like'."
    elif filler_rate > 1: # Moderate frequency
        filler_penalty = min(filler_rate * 2, 20)
        filler_score = max(0, 100 - filler_penalty)
        filler_feedback = f"Moderate use of filler words ({filler_rate}%) detected. Be mindful of hesitation words."
        
    filler_score = round(filler_score, 2)

    # 6. Overall Fluency Score
    fluency_score = (0.5 * wpm_score) + (0.5 * filler_score)
    fluency_score = round(fluency_score, 2)
    
    overall_fluency_feedback = f"Pacing: {wpm_feedback} | Fillers: {filler_feedback}"
    
    return {
        "score": fluency_score,
        "wpm": wpm,
        "word_count": word_count,
        "duration_seconds": duration_seconds,
        "filler_count": filler_count,
        "filler_rate": filler_rate,
        "feedback": overall_fluency_feedback
    }

def calculate_overall_score(content_score, fluency_score):
    """Calculates the final weighted score."""
    overall_score = (content_score * CONTENT_WEIGHT) + (fluency_score * FLUENCY_WEIGHT)
    return round(overall_score, 2)