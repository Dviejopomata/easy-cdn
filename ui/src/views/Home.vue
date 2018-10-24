<template>
  <HelloWorld />
</template>

<script>
import HelloWorld from "../components/HelloWorld";

export default {
  components: {
    HelloWorld
  },
  created() {
    this.$store.commit("setBreadcrumbs", [
      {
        text: "Domains",
        disabled: true
      }
    ]);
  }
};
</script>
