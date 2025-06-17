<!-- بسم الله الرحمن الرحيم-->

<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<script defer src="https://cloud.umami.is/script.js" data-website-id="8373fa1f-38fb-4f58-81db-5f99fff287cd"></script>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;700&family=Chivo+Mono:wght@400;700&display=swap">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
    <title>akh</title>
</svelte:head>

<ParaglideJS {i18n}>
	{@render children()}
</ParaglideJS>
