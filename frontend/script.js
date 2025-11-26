const API_URL = 'http://127.0.0.1:5000';

const statusDisplay = document.getElementById('interview-status');
const questionCategory = document.getElementById('question-category');
const questionText = document.getElementById('question-text');
const responseArea = document.getElementById('response-area');
const candidateResponse = document.getElementById('candidate-response');
const startBtn = document.getElementById('start-interview-btn');
const refreshBtn = document.getElementById('refresh-questions-btn'); // New refresh button
const feedbackReport = document.getElementById('feedback-report');

// New Voice I/O Elements
const micControlBtn = document.getElementById('mic-control-btn');
const micStatusDisplay = document.getElementById('mic-status');
const microphoneSelect = document.getElementById('microphone-select'); // New microphone selection
const speaker = window.speechSynthesis;

let questions = [];
let currentQuestionIndex = -1;
let interviewStartTime = 0;
let recognizer;
let recording = false;

// Add a helper function to shuffle an array (Fisher-Yates shuffle algorithm)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// --- TTS (Text-to-Speech) Function ---
function speak(text) {
    if (!speaker) {
        micStatusDisplay.textContent = "Error: Speech Synthesis not supported.";
        console.error("Speech Synthesis not supported.");
        return;
    }
    
    // Check if speech synthesis is muted or has issues
    console.log("Speech synthesis available voices:", speaker.getVoices());
    console.log("Number of available voices:", speaker.getVoices().length);
    console.log("Speech synthesis speaking:", speaker.speaking);
    console.log("Speech synthesis pending:", speaker.pending);
    
    // If no voices are available, try to load them
    if (speaker.getVoices().length === 0) {
        console.log("No voices available yet, waiting for voices to load...");
        speaker.onvoiceschanged = function() {
            console.log("Voices loaded:", speaker.getVoices());
            speakWithVoice(text);
        };
        // Set a timeout in case voices never load
        setTimeout(() => {
            if (speaker.getVoices().length === 0) {
                micStatusDisplay.textContent = "Error: No speech synthesis voices available.";
                console.error("No speech synthesis voices available after waiting.");
                micControlBtn.disabled = false;
                micControlBtn.textContent = 'Start Speaking';
            }
        }, 3000);
        return;
    }
    
    // If voices are available, speak immediately
    speakWithVoice(text);
}

function speakWithVoice(text) {
    // Stop any previous speech
    speaker.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Speak slightly slower
    utterance.volume = 1; // Ensure volume is at maximum
    
    // Try to select a good voice
    const voices = speaker.getVoices();
    const englishVoice = voices.find(voice => voice.lang.includes('en') && voice.localService);
    if (englishVoice) {
        utterance.voice = englishVoice;
        console.log("Using voice:", englishVoice.name);
    } else if (voices.length > 0) {
        utterance.voice = voices[0];
        console.log("Using first available voice:", voices[0].name);
    }
    
    // Set button state while speaking
    micControlBtn.disabled = true;
    micControlBtn.textContent = 'Interviewer Speaking...';
    micStatusDisplay.textContent = 'Listening to interviewer...';
    
    // Add event listeners for debugging
    utterance.onstart = () => {
        console.log("Speech started with voice:", utterance.voice ? utterance.voice.name : "default");
        micStatusDisplay.textContent = "Interviewer speaking...";
    };
    
    utterance.onerror = (event) => {
        console.error("Speech error:", event);
        micStatusDisplay.textContent = `Error: Speech synthesis failed. Check console for details.`;
        micControlBtn.disabled = false;
        micControlBtn.textContent = 'Start Speaking';
    };

    // When the interviewer is done speaking, enable the microphone button
    utterance.onend = () => {
        console.log("Speech ended");
        micControlBtn.disabled = false;
        micControlBtn.textContent = 'Start Speaking';
        micStatusDisplay.textContent = "Interviewer done. Click 'Start Speaking' to reply.";
    };
    
    // Speak the text
    speaker.speak(utterance);
}


// --- ASR (Automatic Speech Recognition) Setup ---
if ('webkitSpeechRecognition' in window) {
    // Initial state check for compatibility
    micStatusDisplay.textContent = 'Microphone Status: Ready.';
    
    recognizer = new webkitSpeechRecognition();
    recognizer.continuous = true;  // Keep listening until we manually stop
    recognizer.interimResults = true; // Get interim results
    recognizer.maxAlternatives = 1;
    recognizer.lang = 'en-US'; 
    
    // Add diagnostics for microphone selection
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const microphones = devices.filter(device => device.kind === 'audioinput');
            console.log('Available microphones:', microphones);
            
            // Populate the microphone selection dropdown
            microphoneSelect.innerHTML = '<option value="">Default Microphone</option>';
            microphones.forEach((mic, index) => {
                const option = document.createElement('option');
                option.value = mic.deviceId;
                option.text = mic.label || `Microphone ${index + 1}`;
                microphoneSelect.appendChild(option);
            });
            
            if (microphones.length > 0) {
                console.log('Using default microphone:', microphones[0].label || 'Default');
                micStatusDisplay.textContent = `Microphone Status: Ready. Found ${microphones.length} microphone(s).`;
                
                // Log detailed microphone information
                microphones.forEach((mic, index) => {
                    console.log(`Microphone ${index + 1}:`, mic.label || `Microphone ${index + 1}`);
                });
            }
        })
        .catch(err => {
            console.error('Error enumerating devices:', err);
            micStatusDisplay.textContent = 'Microphone Status: Ready. (Unable to list devices)';
        });
    
    // Request microphone permission early to avoid issues
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log("Microphone access granted");
            // Stop all tracks to release the microphone after testing access
            stream.getTracks().forEach(track => track.stop());
        })
        .catch(err => {
            console.error("Microphone access denied:", err);
            micStatusDisplay.textContent = 'Microphone Status: Permission denied. Please allow microphone access.';
        });
    
    // Variables to handle continuous recognition
    let finalTranscript = '';
    let silenceTimer = null;
    const SILENCE_THRESHOLD = 2000; // 2 seconds of silence before stopping
    
    // Recognizer events
    
    recognizer.onstart = () => {
        recording = true;
        micStatusDisplay.textContent = 'Microphone Status: Listening... Speak now!'; // Temporary status
        micControlBtn.textContent = 'Stop Speaking'; // Allow manual stop
        micControlBtn.disabled = false; // Must be enabled for manual stop
        
        // Start duration timer
        interviewStartTime = Date.now(); 
        candidateResponse.value = '';
        finalTranscript = '';
        
        // Clear any existing silence timer
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    };

    recognizer.onaudiostart = () => {
        micStatusDisplay.textContent = 'Microphone Status: LISTENING... Audio stream confirmed.'; 
        console.log("Audio stream started");
    };
    
    recognizer.onresult = (event) => {
        // Reset silence timer on any speech activity
        if (silenceTimer) {
            clearTimeout(silenceTimer);
        }
        
        // Process interim and final results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                console.log("Final transcript chunk:", event.results[i][0].transcript);
            } else {
                // Interim results - update the display but don't add to final transcript yet
                const interimTranscript = finalTranscript + event.results[i][0].transcript;
                candidateResponse.value = interimTranscript;
                console.log("Interim transcript:", event.results[i][0].transcript);
            }
        }
        
        // Update the textarea with the current final transcript
        candidateResponse.value = finalTranscript;
        
        // Set a timer to stop recognition after silence
        silenceTimer = setTimeout(() => {
            if (recording) {
                console.log("Stopping recognition due to silence");
                recognizer.stop();
            }
        }, SILENCE_THRESHOLD);
    };
    
    recognizer.onend = () => {
        recording = false;
        
        // Clear any existing silence timer
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        
        micControlBtn.disabled = true;
        
        // Make sure we have the final transcript
        if (finalTranscript.trim().length > 0) {
            // Only score if some text was captured
            micStatusDisplay.textContent = 'Microphone Status: Recording Ended. Scoring response...';
            micControlBtn.textContent = 'Please Wait...'; 
            candidateResponse.value = finalTranscript.trim();
            submitAnswer(); 
        } else if (candidateResponse.value.trim().length > 0) {
            // Fallback: use whatever is in the textarea
            micStatusDisplay.textContent = 'Microphone Status: Recording Ended. Scoring response...';
            micControlBtn.textContent = 'Please Wait...'; 
            candidateResponse.value = candidateResponse.value.trim();
            submitAnswer();
        } else {
             // If stopped with no speech
            micStatusDisplay.textContent = 'No speech detected. Click "Start Speaking" to try again. Make sure your microphone is properly configured and you have given permission.';
            micControlBtn.textContent = 'Start Speaking';
            micControlBtn.disabled = false;
            
            // Add additional diagnostics
            navigator.mediaDevices.enumerateDevices()
                .then(devices => {
                    const microphones = devices.filter(device => device.kind === 'audioinput');
                    if (microphones.length === 0) {
                        micStatusDisplay.textContent += ' No microphones detected. Please check your device settings.';
                    } else {
                        micStatusDisplay.textContent += ` Detected ${microphones.length} microphone(s). Check browser permissions.`;
                        // Log which microphone is being used
                        console.log("Microphone diagnostics:", microphones);
                    }
                })
                .catch(err => {
                    console.error('Error checking devices:', err);
                });
        }
    };

    recognizer.onerror = (event) => {
        recording = false;
        
        // Clear any existing silence timer
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        
        micStatusDisplay.textContent = `Error: ${event.error}. Click 'Start Speaking' to try again. Check microphone permissions and settings.`;
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        console.error('Speech Recognition Error:', event.error);
        
        // Add more detailed error information
        if (event.error === 'no-speech') {
            micStatusDisplay.textContent += ' Ensure you are speaking clearly into your microphone.';
        } else if (event.error === 'audio-capture') {
            micStatusDisplay.textContent += ' No microphone detected. Please check your device settings.';
        } else if (event.error === 'not-allowed') {
            micStatusDisplay.textContent += ' Microphone access denied. Please allow microphone access in your browser settings.';
        } else if (event.error === 'service-not-allowed') {
            micStatusDisplay.textContent += ' Speech recognition service not allowed. Check browser settings.';
        } else if (event.error === 'bad-grammar') {
            micStatusDisplay.textContent += ' Grammar error. Please try again.';
        } else if (event.error === 'language-not-supported') {
            micStatusDisplay.textContent += ' Language not supported. Please use English.';
        }
        
        console.log("Recognizer state:", recognizer.state);
        console.log("Recognizer error details:", event);
    };

} else {
    micStatusDisplay.textContent = 'Browser Error: Web Speech API (webkitSpeechRecognition) NOT supported. Cannot use voice input.';
    micControlBtn.disabled = true;
}


// --- Interview Flow Management ---

async function fetchQuestions() {
    statusDisplay.textContent = 'Loading questions...';
    console.log("Starting fetchQuestions function");
    
    try {
        console.log("Fetching questions from:", `${API_URL}/interview/start`);
        const response = await fetch(`${API_URL}/interview/start`);
        console.log("Response status:", response.status);
        
        // Check if response is OK
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Received data:", data);
        
        if (data.status === 'success') {
            questions = data.questions;
            console.log("Questions loaded:", questions);
            console.log("Number of questions:", questions ? questions.length : 0);
            
            // Log the first few questions to check their structure
            if (questions && questions.length > 0) {
                console.log("First 3 questions:", questions.slice(0, 3));
                
                // Validate the structure of the first few questions
                for (let i = 0; i < Math.min(3, questions.length); i++) {
                    const q = questions[i];
                    console.log(`Question ${i} structure:`, q);
                    console.log(`Question ${i} keys:`, Object.keys(q));
                    console.log(`Question ${i} has id:`, q.hasOwnProperty('id'));
                    console.log(`Question ${i} id value:`, q.id);
                    console.log(`Question ${i} has question:`, q.hasOwnProperty('question'));
                    console.log(`Question ${i} question value:`, q.question);
                }
            }
            
            if (questions && questions.length > 0) {
                // Validate all questions
                let validQuestions = 0;
                for (let i = 0; i < questions.length; i++) {
                    const q = questions[i];
                    if (q && q.hasOwnProperty('id') && q.hasOwnProperty('question') && 
                        q.id !== null && q.id !== undefined && 
                        q.question && q.question.trim() !== '') {
                        validQuestions++;
                    } else {
                        console.error(`Invalid question at index ${i}:`, q);
                    }
                }
                
                console.log(`Valid questions: ${validQuestions}/${questions.length}`);
                
                if (validQuestions === questions.length) {
                    statusDisplay.textContent = `Ready! Loaded ${questions.length} questions.`;
                    startBtn.disabled = false;
                    console.log("All questions loaded successfully. Start button enabled.");
                } else {
                    statusDisplay.textContent = `Error: Only ${validQuestions}/${questions.length} questions are valid.`;
                    console.error(`Only ${validQuestions}/${questions.length} questions are valid`);
                }
            } else {
                statusDisplay.textContent = 'Error: No questions received from server.';
                console.error("No questions in response:", data);
            }
        } else {
            statusDisplay.textContent = `Error loading questions: ${data.message}`;
            console.error("Server error:", data.message);
        }
    } catch (error) {
        statusDisplay.textContent = 'Error: Could not connect to the Python backend. Make sure the Flask server is running on http://127.0.0.1:5000.';
        console.error('Fetch error:', error);
    }
    
    console.log("Finished fetchQuestions function");
}

function startInterview() {
    console.log("Starting interview with questions:", questions);
    console.log("Number of questions:", questions ? questions.length : 0);
    
    // Check if questions are loaded
    if (!questions || questions.length === 0) {
        statusDisplay.textContent = 'Error: Questions not loaded yet. Please wait for questions to load or refresh the page.';
        console.error("Questions not loaded:", questions);
        
        // Try to fetch questions again
        fetchQuestions().then(() => {
            if (questions && questions.length > 0) {
                // If successful, proceed with starting the interview
                setTimeout(() => {
                    if (questions && questions.length > 0) {
                        startBtn.style.display = 'none';
                        currentQuestionIndex = 0;
                        displayQuestion(currentQuestionIndex);
                        feedbackReport.innerHTML = '<p class="initial-message">Interview in progress...</p>';
                    }
                }, 1000);
            }
        });
        return;
    }
    
    // Shuffle questions for variety
    // Keep the first 3 questions in order (common introductory questions)
    // Shuffle the rest of the questions
    const introQuestionsCount = 3;
    if (questions.length > introQuestionsCount) {
        const introQuestions = questions.slice(0, introQuestionsCount);
        const remainingQuestions = questions.slice(introQuestionsCount);
        const shuffledRemainingQuestions = shuffleArray(remainingQuestions);
        questions = [...introQuestions, ...shuffledRemainingQuestions];
        console.log("Questions shuffled. First 3 kept in order, rest randomized.");
    } else {
        console.log("Not enough questions to shuffle. Keeping original order.");
    }
    
    startBtn.style.display = 'none';
    currentQuestionIndex = 0;
    displayQuestion(currentQuestionIndex);
    feedbackReport.innerHTML = '<p class="initial-message">Interview in progress...</p>';
}

function displayQuestion(index) {
    console.log("Displaying question at index:", index);
    console.log("Total questions:", questions ? questions.length : 0);
    
    // Update the global index
    currentQuestionIndex = index;
    console.log("Updated currentQuestionIndex to:", currentQuestionIndex);
    
    // Validate index
    if (index < 0 || index >= questions.length) {
        console.error("Invalid question index:", index, "Total questions:", questions.length);
        statusDisplay.textContent = 'Error: Invalid question index.';
        return;
    }
    
    const q = questions[index];
    console.log("Question data:", q);
    
    // Validate question data
    if (!q) {
        console.error("Question data is null or undefined at index:", index);
        statusDisplay.textContent = 'Error: Question data is missing or invalid.';
        return;
    }
    
    // Check for required fields
    const requiredFields = ['id', 'question'];
    for (const field of requiredFields) {
        if (!q.hasOwnProperty(field)) {
            console.error(`Question at index ${index} is missing required field: ${field}`, q);
            statusDisplay.textContent = `Error: Question is missing required field: ${field}.`;
            return;
        }
        
        if (q[field] === null || q[field] === undefined || (typeof q[field] === 'string' && q[field].trim() === '')) {
            console.error(`Question at index ${index} has invalid value for field: ${field}`, q);
            statusDisplay.textContent = `Error: Question has invalid value for field: ${field}.`;
            return;
        }
    }
    
    console.log("Question validation passed for index:", index);
    
    // UI Update
    questionCategory.textContent = `Category: ${q.category || 'N/A'} (Q ${index + 1}/${questions.length})`;
    questionText.textContent = q.question;
    responseArea.style.display = 'block';
    
    // --- TTS: Program speaks the question (sets button state internally) ---
    speak(q.question); 
    
    statusDisplay.textContent = 'Interviewer is speaking.';
}

function endInterview() {
    statusDisplay.textContent = 'Interview Complete! Scroll down for the full summary.';
    questionText.textContent = 'Thank you for participating.';
    responseArea.style.display = 'none';
    startBtn.style.display = 'none';
}


// --- Submission and Scoring Logic ---

async function submitAnswer() {
    const responseText = candidateResponse.value.trim();
    
    // 1. DURATION CALCULATION
    const interviewEndTime = Date.now();
    const durationSeconds = (interviewEndTime - interviewStartTime) / 1000;
    
    // Validate required fields before sending
    if (responseText.length < 1) {
        micStatusDisplay.textContent = "No speech detected. Please try speaking again.";
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        return;
    }
    
    console.log("Submitting answer for question index:", currentQuestionIndex);
    console.log("Total questions:", questions ? questions.length : 0);
    console.log("Questions array:", questions);
    
    // Validate question index
    if (currentQuestionIndex < 0) {
        micStatusDisplay.textContent = "Error: Invalid question index. Please restart the interview.";
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        console.error("Invalid question index (negative):", currentQuestionIndex);
        return;
    }
    
    if (!questions || questions.length === 0) {
        micStatusDisplay.textContent = "Error: No questions loaded. Please restart the interview.";
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        console.error("No questions loaded:", questions);
        return;
    }
    
    if (currentQuestionIndex >= questions.length) {
        micStatusDisplay.textContent = "Error: Question index out of range. Please restart the interview.";
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        console.error("Question index out of range:", currentQuestionIndex, "Total questions:", questions.length);
        return;
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    console.log("Current question data:", currentQuestion);
    
    // Validate question data
    if (!currentQuestion) {
        micStatusDisplay.textContent = "Error: Question data is missing. Please restart the interview.";
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
        console.error("Question data is missing for index:", currentQuestionIndex);
        return;
    }
    
    // Check for required fields
    const requiredFields = ['id', 'question'];
    for (const field of requiredFields) {
        if (!currentQuestion.hasOwnProperty(field)) {
            micStatusDisplay.textContent = `Error: Question is missing required field: ${field}. Please restart the interview.`;
            micControlBtn.textContent = 'Start Speaking';
            micControlBtn.disabled = false;
            console.error(`Question at index ${currentQuestionIndex} is missing required field: ${field}`, currentQuestion);
            return;
        }
        
        if (currentQuestion[field] === null || currentQuestion[field] === undefined || 
            (typeof currentQuestion[field] === 'string' && currentQuestion[field].trim() === '')) {
            micStatusDisplay.textContent = `Error: Question has invalid value for field: ${field}. Please restart the interview.`;
            micControlBtn.textContent = 'Start Speaking';
            micControlBtn.disabled = false;
            console.error(`Question at index ${currentQuestionIndex} has invalid value for field: ${field}`, currentQuestion);
            return;
        }
    }
    
    console.log("Question validation passed. Question ID:", currentQuestion.id);
    
    // 2. Prepare Payload
    const payload = {
        question_id: currentQuestion.id,
        transcript: responseText,
        duration_seconds: durationSeconds
    };
    
    console.log("Sending payload to server:", payload); // Debug log
    
    micStatusDisplay.textContent = `Duration recorded: ${durationSeconds.toFixed(2)} seconds. Sending to server for scoring...`;
    micControlBtn.textContent = 'Scoring...'; 
    micControlBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/interview/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            displayFeedback(data.report);
        } else {
            console.error("Scoring failed:", data.message);
            alert(`Scoring Failed: ${data.message}`);
            feedbackReport.innerHTML = `<p class="score-poor">Error: ${data.message}</p>`;
            // Re-enable controls so user can try again
            micControlBtn.textContent = 'Start Speaking';
            micControlBtn.disabled = false;
        }
    } catch (error) {
        console.error('Score submission error:', error);
        alert('Communication Error: Check console and ensure Flask server is running.');
        // Re-enable controls so user can try again
        micControlBtn.textContent = 'Start Speaking';
        micControlBtn.disabled = false;
    }

    // Advance to the next question automatically after a short delay
    currentQuestionIndex++;
    console.log("Advancing to next question index:", currentQuestionIndex);
    
    setTimeout(() => {
        if (currentQuestionIndex < questions.length) {
            displayQuestion(currentQuestionIndex);
        } else {
            endInterview();
        }
    }, 3000); // Wait 3 seconds to allow user to read the feedback before moving to next question
}

function getScoreClass(score) {
    if (score >= 80) return 'score-good';
    if (score >= 50) return 'score-average';
    return 'score-poor';
}

function displayFeedback(report) {
    const overallClass = getScoreClass(report.overall_score);
    const contentClass = getScoreClass(report.content.score);
    const fluencyClass = getScoreClass(report.fluency.score);

    const feedbackHTML = `
        <h3>Question ${currentQuestionIndex + 1} Scorecard</h3>
        <p><strong>Question:</strong> ${questions[currentQuestionIndex].question}</p>
        <p><strong>Your Answer (Transcript):</strong> ${report.transcript}</p>
        
        <hr>

        <h4>Overall Performance: <span class="${overallClass}">${report.overall_score}%</span></h4>
        
        <p><strong>Content Score:</strong> <span class="${contentClass}">${report.content.score}%</span></p>
        <p><em>Content Feedback:</em> ${report.content.feedback}</p>
        
        <hr>

        <p><strong>Fluency Score:</strong> <span class="${fluencyClass}">${report.fluency.score}%</span></p>
        <p><em>Fluency Metrics:</em></p>
        <ul>
            <li>Words Per Minute (WPM): <strong>${report.fluency.wpm}</strong> (Target: 130-170)</li>
            <li>Filler Word Rate: <strong>${report.fluency.filler_rate}%</strong> (${report.fluency.filler_count} fillers detected)</li>
            <li><em>Pacing/Filler Summary:</em> ${report.fluency.feedback}</li>
        </ul>
        <p style="color: #007bff; font-weight: bold;">Next question coming up in 3 seconds...</p>
        <hr>
    `;

    // Prepend the new feedback to the report area
    feedbackReport.innerHTML = feedbackHTML + feedbackReport.innerHTML;
    
    statusDisplay.textContent = 'Scoring complete. Moving to next question shortly...';
}

// --- Voice Control Function (Attached to button) ---
function toggleSpeechRecognition() {
    if (!recognizer) return;

    if (recording) {
        // Stop the recognition manually. onend will handle scoring.
        recognizer.stop(); 
    } else {
        // Clear previous results and start recording
        candidateResponse.value = '';
        
        // Set the microphone device if one is selected
        const selectedMicId = microphoneSelect.value;
        if (selectedMicId) {
            recognizer.deviceId = selectedMicId;
            console.log("Using selected microphone with ID:", selectedMicId);
        }
        
        recognizer.start(); 
    }
}


// --- Event Listeners ---
startBtn.addEventListener('click', startInterview);
refreshBtn.addEventListener('click', fetchQuestions); // Add refresh button listener
micControlBtn.addEventListener('click', toggleSpeechRecognition);

// Initial load with a small delay to ensure backend is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded event fired");
    // Add a small delay to ensure backend is fully initialized
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Starting initial question fetch");
    fetchQuestions();
});
