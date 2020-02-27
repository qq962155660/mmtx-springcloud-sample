package io.mmtx.demo.netty;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import io.netty.channel.Channel;

public class ChannelMap {

	private static Map<String,Channel> channels = new ConcurrentHashMap<>();
	
	public static void addChannel(String id,Channel channel){
		channels.put(id, channel);
	}
	public static Map<String,Channel> getAllChannel(){
		return channels;
	}
	public static void remove(String key){
		channels.remove(key);
	}
}
