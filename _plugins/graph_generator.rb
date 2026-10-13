# frozen_string_literal: true

module Jekyll
  class GraphGenerator < Generator
    safe true
    priority :low

    def generate(site)
      return unless site.config["graph_enabled"] != false

      posts = site.posts.docs.select { |p| p.data["layout"] == "post" }

      nodes = []
      edges = []
      tag_counts = Hash.new(0)
      category_counts = Hash.new(0)

      posts.each do |post|
        post_data = post.data
        slug = post_data["slug"] || post.basename_without_ext
        url = post.url
        title = post_data["title"] || slug
        tags = Array(post_data["tags"])
        categories = Array(post_data["categories"])
        date = post_data["date"]
        excerpt = post_data["excerpt"] || ""

        nodes << {
          id: "post:#{slug}",
          type: "post",
          label: title,
          url: url,
          tags: tags,
          categories: categories,
          date: date ? date.strftime("%Y-%m-%d") : "",
          excerpt: excerpt.to_s.strip[0,120],
          group: categories.first || "uncategorized"
        }

        tags.each do |tag|
          tag_counts[tag] += 1
          tag_id = "tag:#{tag}"
          unless nodes.any? { |n| n[:id] == tag_id }
            nodes << {
              id: tag_id,
              type: "tag",
              label: tag,
              count: 0,
              group: "tag"
            }
          end
          edges << { source: "post:#{slug}", target: tag_id, type: "tag" }
        end

        categories.each do |cat|
          category_counts[cat] += 1
          cat_id = "category:#{cat}"
          unless nodes.any? { |n| n[:id] == cat_id }
            nodes << {
              id: cat_id,
              type: "category",
              label: cat,
              count: 0,
              group: "category"
            }
          end
          edges << { source: "post:#{slug}", target: cat_id, type: "category" }
        end
      end

      nodes.each do |node|
        if node[:type] == "tag"
          node[:count] = tag_counts[node[:label]]
        elsif node[:type] == "category"
          node[:count] = category_counts[node[:label]]
        end
      end

      post_nodes = nodes.select { |n| n[:type] == "post" }
      post_nodes.combination(2).each do |a, b|
        shared_tags = a[:tags] & b[:tags]
        shared_cats = a[:categories] & b[:categories]
        weight = shared_tags.size + shared_cats.size * 0.5
        if weight > 0
          edges << {
            source: a[:id],
            target: b[:id],
            type: "similarity",
            weight: weight,
            shared_tags: shared_tags,
            shared_cats: shared_cats
          }
        end
      end

      posts.each do |post|
        content = post.content || ""
        slug = post.data["slug"] || post.basename_without_ext
        content.scan(/\[\[([^\]]+)\]\]/).each do |match|
          target_title = match[0].strip
          target_post = posts.find { |p| p.data["title"]&.strip == target_title || (p.data["slug"] || p.basename_without_ext) == target_title }
          if target_post
            target_slug = target_post.data["slug"] || target_post.basename_without_ext
            edges << { source: "post:#{slug}", target: "post:#{target_slug}", type: "explicit" }
          end
        end
      end

      edges.uniq! { |e| [e[:source], e[:target], e[:type]].join("|") }

      graph_data = {
        nodes: nodes,
        edges: edges,
        meta: {
          generated_at: Time.now.iso8601,
          post_count: posts.size,
          tag_count: tag_counts.size,
          category_count: category_counts.size
        }
      }

      require "json"
      require "fileutils"

      File.write(
        File.join(site.dest, "assets", "data", "graph.json"),
        JSON.pretty_generate(graph_data)
      )

      FileUtils.mkdir_p(File.join(site.source, "assets", "data"))
      File.write(
        File.join(site.source, "assets", "data", "graph.json"),
        JSON.pretty_generate(graph_data)
      )

      puts "Graph Generator: #{nodes.size} nodes, #{edges.size} edges generated"
    end
  end
end
