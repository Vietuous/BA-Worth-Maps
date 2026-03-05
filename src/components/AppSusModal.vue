<template>
    <div v-if="show" class="modal-backdrop">
        <div class="modal">
            <div class="modal-header">
                <h2>System Usability Scale (SUS)</h2>
                <div class="header-controls">
                    <button class="icon-btn" @click="$emit('close')" title="Close without submitting">×</button>
                </div>
            </div>

            <p class="instruction">
                Please rate the following statements based on your experience with the tool.
            </p>
            <div class="scale-legend">
                <span>1 = Strongly disagree</span>
                <span>5 = Strongly agree</span>
            </div>

            <div class="sus-questions">
                <div v-for="(q, i) in questions" :key="i" class="sus-item">
                    <div class="question-row">
                        <span class="q-text">{{ i + 1 }}. {{ q }}</span>
                        <div class="rating">
                            <label v-for="n in 5" :key="n" class="radio-label">
                                <input type="radio" :name="'q' + i" :value="n" v-model="answers[i]" />
                                <span class="radio-num">{{ n }}</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="open-questions">
                <div class="open-item">
                    <h3>Additional Feedback (optional)</h3>
                    <label>1. What did you like best about the system?</label>
                    <textarea v-model="openAnswers.likes" rows="3"></textarea>
                </div>
                <div class="open-item">
                    <label>2. What was unclear or needs improvement?</label>
                    <textarea v-model="openAnswers.improvements" rows="3"></textarea>
                </div>
            </div>

            <div class="modal-actions">
                <button class="submit-btn" @click="submitForm" :disabled="isSubmitting">
                    <span v-if="isSubmitting" class="spinner"></span>
                    {{ isSubmitting ? 'Submitting...' : 'Submit' }}
                </button>
                <button class="close-btn" @click="$emit('close')" :disabled="isSubmitting">Close</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    show: Boolean,
    questions: Array
});

const emit = defineEmits(['close', 'submit']);

const answers = ref(new Array(10).fill(null));
const openAnswers = ref({ likes: '', improvements: '' });
const isSubmitting = ref(false);

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwNmzVoZls1Lh2q9RnxUHnEhEC6PWGLHOOIeL1E5axdWixkqdYIQQOY1F5oRla3lGgx/exec";

watch(() => props.show, (val) => {
    if (val) {
        // Reset on open
        answers.value = new Array(10).fill(null);
        openAnswers.value = { likes: '', improvements: '' };
    }
});

const calculateSusScore = () => {
    let score = 0;
    answers.value.forEach((val, index) => {
        const response = val || 3; // Default to 3 if missed (neutral)
        if ((index + 1) % 2 === 1) {
            // Odd questions (1, 3, 5...): score = response - 1
            score += (response - 1);
        } else {
            // Even questions (2, 4, 6...): score = 5 - response
            score += (5 - response);
        }
    });
    return score * 2.5;
};

const submitForm = async () => {
    if (isSubmitting.value) return;
    isSubmitting.value = true;

    const susScore = calculateSusScore();

    const result = {
        timestamp: new Date().toISOString(),
        browser: navigator.userAgent,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        sus_scores: answers.value,
        susScore: susScore,
        feedback: openAnswers.value
    };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors", // Wichtig für Google Apps Script
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
        });
    } catch (e) {
        console.error("Submission failed", e);
    } finally {
        isSubmitting.value = false;
        emit('submit'); // Signalisiert Erfolg an App.vue für den Toast
    }
};
</script>

<style scoped>
.modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    /* Highest priority */
    pointer-events: none;
    /* Let clicks pass through backdrop */
}

.modal {
    pointer-events: auto;
    background: white;
    padding: 40px;
    border-radius: 12px;
    max-width: 900px;
    /* Wider */
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    color: #333;
    /* Force black text */
    transition: all 0.3s ease;
    box-sizing: border-box;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.header-controls {
    display: flex;
    gap: 10px;
}

.icon-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: #666;
    padding: 0 5px;
}

.icon-btn:hover {
    color: #000;
}

h2 {
    margin-top: 0;
    margin-bottom: 0;
    color: #2c3e50;
}

.instruction {
    margin-bottom: 15px;
    font-style: italic;
}

.scale-legend {
    display: flex;
    justify-content: space-between;
    background: #f8f9fa;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 20px;
    font-weight: bold;
    font-size: 0.9rem;
}

.sus-item {
    margin-bottom: 12px;
    border-bottom: 1px solid #eee;
    padding-bottom: 12px;
}

.question-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
}

.q-text {
    flex: 1;
    font-weight: 500;
}

.rating {
    display: flex;
    gap: 15px;
    min-width: 200px;
    justify-content: flex-end;
    flex-shrink: 0;
    /* Prevent wrapping/squishing */
}

.radio-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    font-size: 0.8rem;
}

.open-questions {
    margin-top: 30px;
    border-top: 2px solid #eee;
    padding-top: 20px;
}

.open-item {
    margin-bottom: 20px;
}

.open-item h3 {
    font-size: 1.1rem;
    margin-bottom: 15px;
}

.open-item label {
    display: block;
    font-weight: bold;
    margin-bottom: 8px;
}

.open-item textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-family: inherit;
    min-height: 100px;
    /* Taller */
    resize: vertical;
    box-sizing: border-box;
    display: block;
    margin-top: 5px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
}

.submit-btn {
    background-color: #42b983;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.close-btn {
    background-color: #eee;
    color: #333;
}

.spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s ease-in-out infinite;
    margin-right: 8px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>