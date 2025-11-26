from flask import Flask, jsonify, request
from flask_cors import CORS 
import os
from threading import Lock

# Import the scoring functions and data loading from the local scorer.py
# NOTE: Ensure your scorer.py file contains the full code provided previously.
from scorer import load_resources, calculate_content_score, calculate_fluency_metrics, calculate_overall_score

# Import send_from_directory to serve static files
from flask import send_from_directory

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Define the base path for loading data (the backend folder itself)
BASE_PATH = os.path.dirname(os.path.abspath(__file__))

# Get the parent directory to access frontend files
PARENT_DIR = os.path.dirname(BASE_PATH)
FRONTEND_DIR = os.path.join(PARENT_DIR, 'frontend')

# Global variables and flag for one-time setup
QUESTIONS_FOR_FRONTEND = []
SETUP_DONE = False
setup_lock = Lock()  # Use a lock to prevent race conditions during setup

# --- Modern Flask Setup Function ---

@app.before_request
def initial_setup():
    """
    Ensures that the model and question bank are loaded ONLY once 
    when the first request hits the server.
    """
    global QUESTIONS_FOR_FRONTEND, SETUP_DONE
    
    # Check if setup has already run using the global flag
    if not SETUP_DONE:
        # Acquire a lock to ensure only one thread performs the setup
        with setup_lock:
            # Re-check the flag inside the lock in case another thread waited
            if not SETUP_DONE:
                print("--- Initial Setup: Loading Model and Question Bank ---")
                
                # Load all resources (model, embeddings, and question data)
                QUESTIONS_FOR_FRONTEND = load_resources(base_path=BASE_PATH)
                
                print("--- Setup Complete. Server Ready ---")
                SETUP_DONE = True 

# --- API Endpoints ---

@app.route('/interview/start', methods=['GET'])
def get_questions():
    """
    Endpoint 1: Returns the list of questions to the frontend 
    to begin the interview flow.
    """
    # Note: initial_setup is guaranteed to have run before this point
    return jsonify({
        "status": "success",
        "questions": QUESTIONS_FOR_FRONTEND
    })

@app.route('/interview/score', methods=['POST'])
def score_response():
    """
    Endpoint 2: Receives the candidate's response (transcript + duration) 
    and returns a detailed scorecard.
    """
    try:
        data = request.get_json()
        
        question_id = data.get('question_id')
        transcript = data.get('transcript', '')
        duration_seconds = data.get('duration_seconds', 0.0)
        
        if not question_id or not transcript:
            return jsonify({
                "status": "error",
                "message": "Missing question_id or transcript in request."
            }), 400

        # 1. Content Scoring
        content_score, content_feedback = calculate_content_score(
            question_id, 
            transcript
        )
        
        # 2. Fluency Scoring
        fluency_metrics = calculate_fluency_metrics(
            transcript, 
            duration_seconds
        )
        fluency_score = fluency_metrics['score']
        
        # 3. Overall Score
        overall_score = calculate_overall_score(content_score, fluency_score)

        # 4. Compile Report
        report = {
            "question_id": question_id,
            "transcript": transcript,
            "overall_score": overall_score,
            "content": {
                "score": content_score,
                "feedback": content_feedback
            },
            "fluency": fluency_metrics
        }
        
        return jsonify({
            "status": "success",
            "report": report
        })

    except Exception as e:
        print(f"An error occurred during scoring: {e}")
        return jsonify({
            "status": "error",
            "message": f"Internal Server Error: {str(e)}"
        }), 500

# --- Static File Serving ---

# Serve the main index.html file
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

# Serve other static files (CSS, JS, etc.)
@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

# --- Execution ---

if __name__ == '__main__':
    # This block is for direct Python execution
    # For 'flask run', we use the environment variable
    app.run(debug=True, port=5000)