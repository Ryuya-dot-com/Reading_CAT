# JACET CAT Data Analysis Notebook
# This notebook allows interactive analysis of collected JSON data

# %% [markdown]
# ## 1. Setup and Data Loading

# %%
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import plotly.express as px
import plotly.graph_objects as go
from IPython.display import display, HTML

# Japanese font settings
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Hiragino Sans', 'Yu Gothic', 'Meirio']

# Load data
with open('cat_detailed_data_session_1753093575303_edbigwvdp.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("Data loaded successfully!")

# %% [markdown]
# ## 2. Data Preprocessing

# %%
# Prepare vocabulary test data
vocab_responses = data['testResults']['vocabulary']['responses']
vocab_df = pd.DataFrame(vocab_responses)

# Create additional columns
vocab_df['response_time_sec'] = vocab_df['responseTime'] / 1000
vocab_df['order'] = range(1, len(vocab_df) + 1)

# Show basic statistics
print("=== Basic Stats for Vocabulary Test ===")
print(f"Total items: {len(vocab_df)}")
print(f"Correct answers: {vocab_df['correct'].sum()}")
print(f"Accuracy: {vocab_df['correct'].mean() * 100:.1f}%")
print(f"Average response time: {vocab_df['response_time_sec'].mean():.1f} seconds")

# Display head of the DataFrame
display(vocab_df.head())

# %% [markdown]
# ## 3. Ability Score (θ) Progression Analysis

# %%
# Extract theta progression from interaction data
theta_progression = []
for inter in data['sessionInfo']['interactions']:
    if inter['action'] == 'vocab_response':
        theta_progression.append({
            'question': len(theta_progression) + 1,
            'theta': inter['data']['newTheta'],
            'se': inter['data']['newSE'],
            'correct': inter['data']['correct']
        })

theta_df = pd.DataFrame(theta_progression)

# Interactive plot (Plotly)
fig = go.Figure()

# θ progression
fig.add_trace(go.Scatter(
    x=theta_df['question'],
    y=theta_df['theta'],
    mode='lines+markers',
    name='Ability Score (θ)',
    line=dict(color='blue', width=2),
    marker=dict(size=8)
))

# Confidence intervals
fig.add_trace(go.Scatter(
    x=theta_df['question'],
    y=theta_df['theta'] + theta_df['se'],
    mode='lines',
    name='Upper Bound (θ+SE)',
    line=dict(color='lightblue', dash='dash')
))

fig.add_trace(go.Scatter(
    x=theta_df['question'],
    y=theta_df['theta'] - theta_df['se'],
    mode='lines',
    name='Lower Bound (θ-SE)',
    line=dict(color='lightblue', dash='dash'),
    fill='tonexty'
))

fig.update_layout(
    title='Ability Score (θ) Progression',
    xaxis_title='Question Number',
    yaxis_title='Ability Score',
    hovermode='x unified'
)

fig.show()

# %% [markdown]
# ## 4. Analysis by Level and Part of Speech

# %%
# Analysis by level
level_analysis = vocab_df.groupby('level').agg({
    'correct': ['count', 'sum', 'mean'],
    'response_time_sec': 'mean'
}).round(2)

level_analysis.columns = ['Item Count', 'Correct Count', 'Accuracy', 'Avg. Response Time']

# Visualization
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

# Accuracy by level
ax1.bar(level_analysis.index, level_analysis['Accuracy'])
ax1.set_xlabel('Level')
ax1.set_ylabel('Accuracy')
ax1.set_title('Accuracy by Level')
ax1.set_ylim(0, 1.1)

# Avg. response time by level
ax2.bar(level_analysis.index, level_analysis['Avg. Response Time'])
ax2.set_xlabel('Level')
ax2.set_ylabel('Avg. Response Time (sec)')
ax2.set_title('Avg. Response Time by Level')

plt.tight_layout()
plt.show()

display(level_analysis)

# %% [markdown]
# ## 5. Detailed Analysis of Incorrect Responses

# %%
# Extract incorrect answers
incorrect_items = vocab_df[vocab_df['correct'] == 0]

if len(incorrect_items) > 0:
    print("=== Incorrect Response Details ===")
    for _, row in incorrect_items.iterrows():
        print(f"\nWord: {row['item']}")
        print(f"Correct Answer: {row['correctAnswer']}")
        print(f"Selected: {row['selectedAnswer']}")
        print(f"Level: {row['level']}")
        print(f"Part of Speech: {row['partOfSpeech']}")
        print(f"Response Time: {row['response_time_sec']:.1f} seconds")
        
        # Classify error pattern
        correct = row['correctAnswer']
        selected = row['selectedAnswer']
        
        if correct[0] == selected[0]:
            print("Pattern: Same initial letter (phonological similarity)")
        elif len(correct) == len(selected):
            print("Pattern: Same number of characters (morphological similarity)")

# %% [markdown]
# ## 6. Reading Test Analysis

# %%
# Extract reading responses
reading_responses = [r for r in data['sessionInfo']['detailedResponses'] 
                    if r['phase'].startswith('reading_')]

reading_df = pd.DataFrame(reading_responses)

# Compute reading time
timings = data['testResults']['reading']['timings']

print("=== Reading Test Analysis ===")
for text_type in ['narrative', 'expository']:
    start = datetime.fromisoformat(timings[text_type]['textStart'].replace('Z', '+00:00'))
    q1_start = datetime.fromisoformat(timings[text_type]['question1Start'].replace('Z', '+00:00'))
    
    reading_time = (q1_start - start).total_seconds()
    text = data['testResults']['reading']['texts'][text_type]['text']
    word_count = len(text.split())
    wpm = (word_count / reading_time) * 60 if reading_time > 0 else 0
    
    print(f"\n{text_type.capitalize()}:")
    print(f"  Word Count: {word_count}")
    print(f"  Reading Time: {reading_time:.1f} seconds")
    print(f"  Reading Speed: {wpm:.0f} WPM")
    
    # Check quality of answers
    answers = data['testResults']['reading']['answers'][text_type]
    for q_num, answer in enumerate(['question1', 'question2'], 1):
        print(f"  Q{q_num} Answer: '{answers[answer]}' ({len(answers[answer])} characters)")

# %% [markdown]
# ## 7. Time and Mouse Tracking Analysis

# %%
# Visualize mouse movements
mouse_data = pd.DataFrame(data['sessionInfo']['mouseMovements'])
mouse_data['time_sec'] = (mouse_data['timestamp'] - mouse_data['timestamp'].iloc[0]) / 1000

# Heatmap of mouse movements
plt.figure(figsize=(10, 6))
plt.scatter(mouse_data['x'], mouse_data['y'], c=mouse_data['time_sec'], 
           cmap='viridis', alpha=0.5, s=10)
plt.colorbar(label='Elapsed Time (sec)')
plt.xlabel('X Coordinate')
plt.ylabel('Y Coordinate')
plt.title('Mouse Movement Pattern')
plt.gca().invert_yaxis()  # Invert Y-axis
plt.show()

# %% [markdown]
# ## 8. Extract Error Patterns for AI Application

# %%
def extract_error_patterns(vocab_df):
    """Extract error patterns to prepare data for AI learning"""
    
    error_data = []
    
    for _, row in vocab_df.iterrows():
        # Collect all options
        options = [
            row['correctAnswer'],
            row.get('distractor1', ''),
            row.get('distractor2', ''),
            row.get('distractor3', '')
        ]
        
        # Record pattern if incorrect
        if row['correct'] == 0:
            error_data.append({
                'japanese': row['item'],
                'correct': row['correctAnswer'],
                'selected': row['selectedAnswer'],
                'level': row['level'],
                'pos': row['partOfSpeech'],
                'response_time': row['response_time_sec'],
                'difficulty': row['itemParameters']['difficulty'],
                'discrimination': row['itemParameters']['discrimination']
            })
    
    return pd.DataFrame(error_data)

# Extract error patterns
error_patterns_df = extract_error_patterns(vocab_df)

if len(error_patterns_df) > 0:
    print("=== Error Data for AI Learning ===")
    display(error_patterns_df)
    
    # Save error patterns as JSON
    error_patterns_df.to_json('error_patterns.json', orient='records', force_ascii=False, indent=2)
    print("\nSaved error patterns to error_patterns.json")

# %% [markdown]
# ## 9. Generate Summary Report

# %%
# Summary report
report = f"""
# JACET CAT Analysis Report

## Session Info
- Session ID: {data['sessionInfo']['sessionId']}
- Date/Time: {data['sessionInfo']['startTime']}
- Total Duration: {data['sessionInfo']['totalDuration'] / 1000 / 60:.1f} minutes

## Vocabulary Test Results
- Estimated Vocabulary Size: {int(data['testResults']['vocabulary']['vocabSize'])} words
- Accuracy: {vocab_df['correct'].mean() * 100:.1f}%
- Final Ability Score (θ): {data['testResults']['vocabulary']['theta']:.3f}
- Standard Error (SE): {data['testResults']['vocabulary']['se']:.3f}

## Error Analysis
- Number of Incorrect Responses: {len(vocab_df[vocab_df['correct'] == 0])}
- Main Error Pattern: {'Phonological Similarity' if len(error_patterns_df) > 0 else 'None'}

## Reading Test Results
- Reading Level: {data['testResults']['reading']['level']}K
- Narrative Reading Speed: {int((len(data['testResults']['reading']['texts']['narrative']['text'].split()) / ((datetime.fromisoformat(timings['narrative']['question1Start'].replace('Z', '+00:00')) - datetime.fromisoformat(timings['narrative']['textStart'].replace('Z', '+00:00'))).total_seconds() / 60)))} WPM
- Expository Reading Speed: {int((len(data['testResults']['reading']['texts']['expository']['text'].split()) / ((datetime.fromisoformat(timings['expository']['question1Start'].replace('Z', '+00:00')) - datetime.fromisoformat(timings['expository']['textStart'].replace('Z', '+00:00'))).total_seconds() / 60)))} WPM

## AI Application Suggestions
1. **Automated Distractor Generation**: Based on phonological similarity
2. **Answer Quality Monitoring**: Real-time response checking system
3. **Adaptive Difficulty Tuning**: Dynamic adjustment using Neural-IRT
"""

print(report)

# Save report to file
with open('cat_analysis_report.md', 'w', encoding='utf-8') as f:
    f.write(report)
print("\nSaved report to cat_analysis_report.md")