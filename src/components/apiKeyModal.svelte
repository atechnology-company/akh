<script lang="ts">
  import { fade } from 'svelte/transition';
  import { t } from '$lib/i18n';
  
  // Props
  export let showModal = false;
  export let apiKey = '';
  
  // Event dispatcher
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  // Local state
  let inputValue = apiKey;
  let isVisible = false;
  
  // Watch for modal visibility changes
  $: {
    if (showModal) {
      inputValue = apiKey;
      isVisible = true;
    }
  }
  
  // Functions
  function saveApiKey() {
    dispatch('save', inputValue.trim());
    closeModal();
  }
  
  function closeModal() {
    isVisible = false;
    setTimeout(() => {
      if (!isVisible) dispatch('close');
    }, 300); // Match transition duration
  }
</script>

{#if showModal}
<div class="modal-backdrop" transition:fade={{ duration: 200 }} on:click={closeModal}>
  <div class="modal-container" on:click|stopPropagation>
    <div class="modal-content" in:fade={{ duration: 300, delay: 100 }}>
      <h2>API Key Settings</h2>
      
      <p class="description">
        Enter your Gemini API key to enable AI features. You can get a free API key from 
        <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
      </p>
      
      <div class="input-group">
        <label for="api-key-input">Gemini API Key</label>
        <input 
          type="password" 
          id="api-key-input" 
          bind:value={inputValue} 
          placeholder="Enter your API key"
          autocomplete="off"
        />
      </div>
      
      <div class="button-group">
        <button class="cancel-button" on:click={closeModal}>Cancel</button>
        <button class="save-button" on:click={saveApiKey}>Save</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .modal-container {
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }
  
  .modal-content {
    background-color: var(--surface-color, #ffffff);
    color: var(--text-color, #333333);
    padding: 24px;
    border-radius: 12px;
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 1.5rem;
    font-weight: 600;
  }
  
  .description {
    margin-bottom: 24px;
    line-height: 1.5;
    color: var(--text-secondary, #666666);
  }
  
  .description a {
    color: var(--accent-color, #4285f4);
    text-decoration: none;
  }
  
  .input-group {
    margin-bottom: 24px;
  }
  
  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--border-color, #dddddd);
    border-radius: 8px;
    font-size: 1rem;
    background-color: var(--input-bg, #f5f5f5);
    color: var(--text-color, #333333);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  
  input:focus {
    outline: none;
    border-color: var(--accent-color, #4285f4);
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
  }
  
  .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
  
  button {
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.1s;
  }
  
  button:active {
    transform: translateY(1px);
  }
  
  .cancel-button {
    background-color: transparent;
    color: var(--text-color, #333333);
    border: 1px solid var(--border-color, #dddddd);
  }
  
  .cancel-button:hover {
    background-color: var(--hover-bg, #f0f0f0);
  }
  
  .save-button {
    background-color: var(--accent-color, #4285f4);
    color: white;
    border: none;
  }
  
  .save-button:hover {
    background-color: var(--accent-dark, #3367d6);
  }
  
  @media (max-width: 600px) {
    .modal-content {
      padding: 20px;
    }
    
    h2 {
      font-size: 1.3rem;
    }
    
    button {
      padding: 8px 16px;
    }
  }
</style>