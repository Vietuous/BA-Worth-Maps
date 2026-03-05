// c:\Users\Destiny\worth-map-tool\src\components\useTutorial.js
import { computed, ref } from 'vue'

// Centralized Tutorial Content
export const tutorialContent = {
  nshc_start_node: {
    title: 'Start: NSHC',
    text: 'Describe the core problem or need.',
    targetLayer: 'nshc'
  },
  choose_direction: {
    title: 'Choose Direction',
    text: 'Decide on a direction: "Appreciated Worth" (up) or "Requested Worth" (down).',
    targetLayer: 'feature'
  },
  create_feature: {
    title: 'Step 2: Create a Feature',
    text: 'What feature addresses the NSHC? Double click a Feature node in the "Appreciated" (top) or "Requested" (bottom) zone!',
    targetLayer: 'feature'
  },
  rename_feature: {
    title: 'Name the Node',
    text: 'Describe the feature for the NSHC!',
    targetLayer: 'feature'
  },
  quality: {
    title: 'Step 3: Define Quality',
    text: 'Describe the quality!',
    targetLayer: 'quality',
    isOptional: true
  },
  quality_req: {
    title: 'Step 3: Define Quality',
    text: 'Describe the quality!',
    targetLayer: 'quality_req',
    isOptional: true
  },
  hoe: {
    title: 'Step 4: Identify the Goal (HOE)',
    text: 'What is the ultimate human goal or value? This is the "Human-Oriented Element" (HOE).',
    targetLayer: 'hoe'
  },
  hoe_req: {
    title: 'Step 4: Identify the Goal (HOE)',
    text: 'What is the ultimate human goal or value required? This is the "Human-Oriented Element" (HOE).',
    targetLayer: 'hoe_req'
  },
  rename_node: {
    title: 'Name the Node',
    text: 'Describe the node content.',
    targetLayer: null // Dynamic
  },
  connect_nodes: {
    title: 'Connect the Path',
    text: 'Create a complete value chain by connecting nodes. Use Shift + Drag, the interactive function on the top right of every node or via the node context menu. Start from NSHC and go in one direction.',
    targetLayer: null
  },
  tutorial_complete: {
    title: 'Success!',
    text: 'Congratulations, you have completed a full path! Switch to Evaluation Mode to review or create more nodes and value chains!',
    targetLayer: 'nshc'
  }
}

// Robust check for full chain (undirected) - Exported for use in WorthMap
export const checkFullChain = (nodes, links) => {
  const nshcNodes = nodes.filter((n) => n.type === 'nshc')
  const hoeNodes = nodes.filter((n) => n.type === 'hoe' || n.type === 'hoe_req')

  if (nshcNodes.length === 0 || hoeNodes.length === 0) return false

  // Build adjacency list (undirected)
  const adj = new Map()
  links.forEach((l) => {
    const s = l.source.id || l.source
    const t = l.target.id || l.target
    if (!adj.has(s)) adj.set(s, [])
    if (!adj.has(t)) adj.set(t, [])
    adj.get(s).push(t)
    adj.get(t).push(s)
  })

  // BFS from each NSHC to see if we can reach any HOE
  for (const nshc of nshcNodes) {
    const queue = [nshc.id]
    const visited = new Set([nshc.id])
    while (queue.length > 0) {
      const curr = queue.shift()
      const currNode = nodes.find((n) => n.id === curr)
      if (currNode && (currNode.type === 'hoe' || currNode.type === 'hoe_req')) {
        return true // Found a path!
      }
      const neighbors = adj.get(curr) || []
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
  }
  return false
}

export const countFullChains = (nodes, links) => {
  const nshcNodes = nodes.filter((n) => n.type === 'nshc')
  const hoeNodes = nodes.filter((n) => n.type === 'hoe' || n.type === 'hoe_req')

  if (nshcNodes.length === 0 || hoeNodes.length === 0) return 0

  // Build adjacency list (undirected)
  const adj = new Map()
  links.forEach((l) => {
    const s = l.source.id || l.source
    const t = l.target.id || l.target
    if (!adj.has(s)) adj.set(s, [])
    if (!adj.has(t)) adj.set(t, [])
    adj.get(s).push(t)
    adj.get(t).push(s)
  })

  let count = 0
  // Count connected pairs (NSHC -> HOE)
  for (const nshc of nshcNodes) {
    const queue = [nshc.id]
    const visited = new Set([nshc.id])
    while (queue.length > 0) {
      const curr = queue.shift()
      const currNode = nodes.find((n) => n.id === curr)
      if (currNode && (currNode.type === 'hoe' || currNode.type === 'hoe_req')) {
        count++
        // We count one chain per NSHC that reaches *any* HOE.
        // If you want unique paths, it's more complex, but this is a good proxy.
        break
      }
      const neighbors = adj.get(curr) || []
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
  }
  return count
}

export function useTutorial(props, getNodes, editingNode, graphUpdateTrigger) {
  const tutorialStep = ref(null)
  const tutorialHint = ref(null)
  const shakingNodeId = ref(null)
  const skippedSteps = ref(new Set())

  const triggerShake = (id, message) => {
    shakingNodeId.value = id
    tutorialHint.value = message
    setTimeout(() => {
      shakingNodeId.value = null
    }, 500)
    setTimeout(() => {
      if (tutorialHint.value === message) tutorialHint.value = null
    }, 4000)
  }

  const skipCurrentStep = () => {
    if (tutorialStep.value) skippedSteps.value.add(tutorialStep.value)
  }

  const activeSpotlightNodes = computed(() => {
    graphUpdateTrigger.value
    const nodes = getNodes()
    const step = tutorialStep.value

    if (!props.showTutorial || !step) return []

    // Logic to highlight specific nodes based on step
    if (step === 'nshc_start_node') return nodes.filter((n) => n.type === 'nshc')
    if ((step === 'rename_node' || step === 'rename_feature') && editingNode.value)
      return [editingNode.value]

    // Highlight placeholders
    if (step === 'create_feature' || step === 'choose_direction') {
      return nodes.filter(
        (n) => n.name === 'Next: New Feature' && (n.type === 'feature' || n.type === 'feature_req')
      )
    }
    if (step.includes('quality'))
      return nodes.filter((n) => n.name === 'Next: New Quality' && n.type === step)
    if (step.includes('hoe'))
      return nodes.filter(
        (n) => (n.name === 'Goal: New HOE' || n.name === 'New HOE') && n.type === step
      )

    return []
  })

  const validateAction = (actionType, payload) => {
    if (!props.showTutorial) return true
    const step = tutorialStep.value
    if (!step || step === 'tutorial_complete') return true

    if (actionType === 'create') {
      const type = payload
      if (step === 'create_feature') {
        if (type === 'feature' || type === 'feature_req') return true
        triggerShake(type, 'Please create a Feature first.')
        return false
      }
      if (step === 'quality' || step === 'quality_req') {
        if (type === step) return true
        triggerShake(
          type,
          `Please create a ${step === 'quality' ? 'Quality' : 'Quality Requirement'} next.`
        )
        return false
      }
      if (step === 'hoe' || step === 'hoe_req') {
        if (type === step) return true
        triggerShake(type, `Finally, create the ${step === 'hoe' ? 'HOE' : 'HOE Requirement'}.`)
        return false
      }
      if (step === 'rename_node' || step === 'rename_feature') {
        triggerShake(type, 'Please rename the existing node first.')
        return false
      }
    }
    return true
  }

  const updateTutorialStep = (nodes, links) => {
    if (nodes.length === 0) {
      tutorialStep.value = null
      return
    }

    if (editingNode.value) {
      if (editingNode.value.type === 'feature' || editingNode.value.type === 'feature_req') {
        tutorialStep.value = 'rename_feature'
      } else {
        tutorialStep.value = 'rename_node'
      }
      return
    }

    const nshcNode = nodes.find((n) => n.type === 'nshc')
    if (!nshcNode) {
      tutorialStep.value = null
      return
    }

    if (nshcNode.name.startsWith('Start: New')) {
      tutorialStep.value = 'nshc_start_node'
      return
    }

    const featureNodes = nodes.filter((n) => n.type === 'feature' || n.type === 'feature_req')
    const hasCreatedFeature = featureNodes.some((n) => !n.name.includes('Next: New'))

    if (!hasCreatedFeature) {
      tutorialStep.value = 'create_feature'
      return
    }

    if (featureNodes.some((n) => n.name === 'New Feature')) {
      // Wait for rename if it was just created/is placeholder
      // Actually tutorial says "Double click a Feature node", so we wait for rename
      // If user hasn't renamed "Next: New Feature", we stay on create_feature or move to rename?
      // The logic "hasCreatedFeature" checks !n.name.includes('Next: New').
      // So if we are here, we have a feature that is NOT a placeholder.
      // But if it is "New Feature" (default name after add), we want rename.
      if (featureNodes.some((n) => n.name === 'New Feature')) {
        tutorialStep.value = 'rename_feature'
        return
      }
      return
    }

    const qualityNodes = nodes.filter((n) => n.type === 'quality' || n.type === 'quality_req')
    const hasCreatedQuality = qualityNodes.some((n) => !n.name.includes('Next: New'))

    if (
      !hasCreatedQuality &&
      !skippedSteps.value.has('quality') &&
      !skippedSteps.value.has('quality_req')
    ) {
      const editedFeature = featureNodes.find((n) => !n.name.includes('Next: New'))
      tutorialStep.value = editedFeature?.type === 'feature' ? 'quality' : 'quality_req'
      return
    }

    if (qualityNodes.some((n) => n.name.startsWith('New Quality'))) {
      tutorialStep.value = 'rename_node'
      return
    }

    // Fix: Determine target HOE layer based on previous nodes to ensure path consistency
    let targetHoeType = null
    const editedQuality = qualityNodes.find((n) => !n.name.includes('Next: New'))
    if (editedQuality) {
      targetHoeType = editedQuality.type === 'quality' ? 'hoe' : 'hoe_req'
    } else {
      const editedFeature = featureNodes.find((n) => !n.name.includes('Next: New'))
      if (editedFeature) {
        targetHoeType = editedFeature.type === 'feature' ? 'hoe' : 'hoe_req'
      }
    }

    // Only proceed if we know the target direction. If not, previous steps should handle it.
    if (targetHoeType) {
      const hasCreatedTargetHOE = nodes.some(
        (n) =>
          n.type === targetHoeType &&
          !n.name.includes('Next: New') &&
          !n.name.includes('Goal: New HOE') &&
          n.name !== 'New HOE'
      )

      if (!hasCreatedTargetHOE) {
        tutorialStep.value = targetHoeType
        return
      }

      // Check for rename of that specific HOE
      if (
        nodes.some(
          (n) => n.type === targetHoeType && (n.name === 'New HOE' || n.name === 'Goal: New HOE')
        )
      ) {
        tutorialStep.value = 'rename_node'
        return
      }
    }

    if (!checkFullChain(nodes, links)) {
      tutorialStep.value = 'connect_nodes'
    } else {
      tutorialStep.value = 'tutorial_complete'
    }
  }

  return {
    tutorialStep,
    tutorialHint,
    shakingNodeId,
    activeSpotlightNodes,
    validateAction,
    updateTutorialStep,
    tutorialContent,
    skipCurrentStep
  }
}
