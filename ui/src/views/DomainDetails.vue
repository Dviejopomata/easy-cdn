<template>
  <DomainDetails :domainName="domainName" />
</template>

<script>
import DomainDetails from "../components/DomainDetails";
export default {
  data() {
    return {
      domainName: ""
    };
  },
  created() {
    this.domainName = this.$route.params.domainName;

    this.$store.commit("setBreadcrumbs", [
      {
        text: "Domains",
        to: "/domains"
      },
      {
        text: this.domainName,
        disabled: true
      }
    ]);
  },
  name: "Details-domain",
  components: {
    DomainDetails
  }
};
</script>

<style>
</style>
