<template>
  <v-data-table hide-actions ref="accesshere" item-key="domain" :headers="headers"
    :items="domains" class="elevation-1">

    <template slot="items" slot-scope="props">
      <tr>
        <td>
          <router-link :to="`/domains/${props.item.domain}`">
            {{ props.item.domain }}</router-link>
        </td>
      </tr>
    </template>

  </v-data-table>
</template>

<script>
export default {
  data: () => ({
    headers: [
      {
        text: "Domain",
        align: "left",
        sortable: true,
        value: "domain"
      }
    ],
    domains: []
  }),
  methods: {
    // toggleItem(idx) {
    //   this.$refs.accesshere.expanded[idx] = !this.$refs.accesshere.expanded[
    //     idx
    //   ];
    //   this.$forceUpdate();
    // }
  },
  async created() {
    this.domains = await this.$store.dispatch("getDomains");
  }
};
</script>

<style>
</style>
